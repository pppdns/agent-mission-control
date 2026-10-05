/**
 * Deterministic, frame-stepped capture of the real app replaying recorded runs.
 *
 * Every frame advances all of the page's clocks by exactly 1/FPS: Playwright's fake clock (timers, Date,
 * requestAnimationFrame), CSS animations and transitions (Web Animations API), and SVG SMIL timelines
 * (the message flights). The result is smooth footage that does not depend on machine speed.
 *
 * Needs the app in fixture mode:   E2E_FIXTURES=1 pnpm exec next dev --port 3014
 *   pnpm tsx videos/amc-linkedin/capture/record.mts [shot-id ...]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { SHOTS, type Action, type Shot } from "./shots";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLIPS = join(HERE, "..", "clips");
const FRAMES = join(HERE, "frames");
const BASE = process.env.CAPTURE_BASE ?? "http://localhost:3014";
const FPS = 30;
const VIEWPORT = { width: 1600, height: 900 };
const SCALE = 2;
/** Debug aid: log how many elements match this selector once per footage second. */
const PROBE = process.env.CAPTURE_PROBE;

interface LogEvent {
  seq: number;
  ts: number;
  type: string;
}

const CAPTURE_CSS = `
  nextjs-portal { display: none !important; }
  * { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
  /* The translucent inspector reads fine at 1x but muddies under the video's 2x punch-ins. */
  aside[aria-label$=" inspector"].hud { background: linear-gradient(180deg, rgb(16 22 29), rgb(11 15 20)) !important; }
`;

/** Runs in the page. Owns CSS and SMIL animation time once capture starts. */
function captureRuntime() {
  const anims = new WeakMap<Animation, number>();
  const paused = new WeakSet<SVGSVGElement>();
  const begun = new WeakSet<Element>();
  (window as unknown as { __cap: unknown }).__cap = {
    sync(dt: number) {
      for (const a of document.getAnimations()) {
        const t = anims.has(a) ? (anims.get(a) as number) + dt : 0;
        anims.set(a, t);
        if (a.playState !== "paused") a.pause();
        a.currentTime = t;
      }
      for (const svg of document.querySelectorAll("svg")) {
        if (svg.ownerSVGElement) continue;
        if (!paused.has(svg)) {
          paused.add(svg);
          svg.pauseAnimations();
        }
        for (const el of svg.querySelectorAll("animate, animateMotion, animateTransform, set")) {
          if (begun.has(el)) continue;
          begun.add(el);
          (el as SVGAnimationElement).beginElement();
        }
        svg.setCurrentTime(svg.getCurrentTime() + dt / 1000);
      }
    },
  };
}

/** Keeps a live run's stream looking connected after the fixture response ends. */
function quietEventSource() {
  const Native = window.EventSource;
  class Quiet extends Native {
    set onerror(_fn: ((this: EventSource, ev: Event) => unknown) | null) {
      super.onerror = null;
    }
    get onerror() {
      return null;
    }
  }
  window.EventSource = Quiet as typeof EventSource;
}

function sse(events: LogEvent[], end: boolean): string {
  const body = events.map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return end ? `${body}event: end\ndata: {"status":"completed"}\n\n` : `retry: 600000\n${body}`;
}

/** Lets React and other MessageChannel-scheduled work finish without advancing the fake clock. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        let n = 0;
        channel.port1.onmessage = () => (++n >= 4 ? resolve() : channel.port2.postMessage(0));
        channel.port2.postMessage(0);
      }),
  );
}

async function step(page: Page, dt: number) {
  await page.clock.runFor(dt);
  await settle(page);
  await page.evaluate((d) => (window as unknown as { __cap: { sync(dt: number): void } }).__cap.sync(d), dt);
}

async function clickText(page: Page, selector: string, text?: string) {
  const ok = await page.evaluate(
    ({ selector, text }) => {
      const all = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => !text || (el.textContent ?? "").includes(text));
      const el = all.at(-1);
      el?.click();
      return !!el;
    },
    { selector, text },
  );
  if (!ok) throw new Error(`No element for ${selector} ${text ?? ""}`);
}

async function setInput(page: Page, selector: string, value: string) {
  await page.evaluate(
    ({ selector, value }) => {
      const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
      if (!el) throw new Error(`No input ${selector}`);
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { selector, value },
  );
}

const SCRUBBER = 'input[aria-label="Scrub through the run"]';
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** Applies whatever the shot's actions want at footage time `t` (seconds). */
async function applyActions(page: Page, actions: Action[], t: number, prevT: number) {
  for (const a of actions) {
    if (a.type === "type" || a.type === "scrub") {
      const span = a.type === "type" ? a.text.length / a.cps : a.seconds;
      if (t < a.at || prevT > a.at + span) continue;
      const p = Math.min(1, (t - a.at) / span);
      if (a.type === "type") await setInput(page, a.selector, a.text.slice(0, Math.floor(p * a.text.length)));
      else await setInput(page, SCRUBBER, String(Math.round(a.from + (a.to - a.from) * easeInOut(p))));
      continue;
    }
    if (!(prevT < a.at && a.at <= t) && !(a.at === 0 && prevT < 0)) continue;
    if (a.type === "click") await clickText(page, a.selector, a.text);
    if (a.type === "pause") await clickText(page, 'button[aria-label="Pause replay"]');
    if (a.type === "speed") await clickText(page, '[aria-label="Playback speed"] button', `${a.value}×`);
    if (a.type === "scroll")
      await page.evaluate(({ selector, to }) => {
        const el = document.querySelector(selector);
        if (el) el.scrollTop = to === "top" ? 0 : el.scrollHeight;
      }, a);
  }
}

async function waitFor(page: Page, predicate: () => boolean, label: string, maxSteps = 600) {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.evaluate(predicate)) return;
    await step(page, 1000 / FPS);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function record(shot: Shot) {
  const log: LogEvent[] = shot.run ? JSON.parse(readFileSync(join(HERE, "runs", `${shot.run}.json`), "utf8")) : [];
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: "dark" });
  const page = await context.newPage();

  const live = shot.kind === "live";
  const served = live ? log.slice(0, shot.liveCursor) : log;
  const startTime = live ? served[served.length - 1].ts + 1500 : (log.at(-1)?.ts ?? Date.UTC(2026, 9, 5)) + 60_000;
  await page.clock.install({ time: startTime });
  // tsx keeps function names via an injected __name helper, which doesn't exist inside the page.
  await page.addInitScript("window.__name = (f) => f");
  await page.addInitScript(captureRuntime);
  if (live) await page.addInitScript(quietEventSource);

  const runId = `fixture-${shot.id}`;
  if (shot.run) {
    await page.route(`**/api/runs/${runId}/events*`, (route) =>
      route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(served, !live) }),
    );
  }

  const url = shot.kind === "landing" ? `${BASE}/` : `${BASE}/run/${runId}${live ? "" : "?play=1"}`;
  await page.goto(url, { waitUntil: "load" });
  await page.addStyleTag({ content: CAPTURE_CSS });
  await page.clock.pauseAt(startTime + 30_000);
  await settle(page);

  if (shot.kind === "replay") {
    await waitFor(page, () => !!document.querySelector('[aria-label="Pause replay"]'), "replay to start playing");
    if (shot.speed && shot.speed !== 1) await clickText(page, '[aria-label="Playback speed"] button', `${shot.speed}×`);
    await setInput(page, SCRUBBER, String(shot.seek ?? 0));
  } else if (live) {
    await waitFor(page, () => !!document.querySelector('[role="dialog"][aria-label="Human decision needed"]'), "the decision card");
  }

  const dt = 1000 / FPS;
  const warmFrames = Math.round((shot.warm ?? 0.8) * FPS);
  for (let i = 0; i < warmFrames; i++) await step(page, dt);

  const dir = join(FRAMES, shot.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const total = Math.round(shot.seconds * FPS);
  const started = Date.now();
  let prevT = -1;
  let elapsedMs = 0;
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    await applyActions(page, shot.actions ?? [], t, prevT);
    prevT = t;
    const target = Math.round(((f + 1) * 1000) / FPS);
    await step(page, target - elapsedMs);
    elapsedMs = target;
    await page.screenshot({ path: join(dir, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 94, caret: "initial" });
    if (PROBE && f % FPS === 0) console.log(shot.id, t, await page.evaluate((s) => document.querySelectorAll(s).length, PROBE));
  }
  await browser.close();

  mkdirSync(CLIPS, { recursive: true });
  const out = join(CLIPS, `${shot.id}.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.jpg"), "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  console.log(`${shot.id}: ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${out}`);
}

const wanted = process.argv.slice(2);
const shots = wanted.length ? SHOTS.filter((s) => wanted.includes(s.id)) : SHOTS;
if (wanted.length && shots.length !== wanted.length) throw new Error(`Unknown shot in: ${wanted.join(", ")}`);
const concurrency = Number(process.env.CAPTURE_CONCURRENCY ?? 2);
const queue = [...shots];
await Promise.all(
  Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    for (let shot = queue.shift(); shot; shot = queue.shift()) await record(shot);
  }),
);
