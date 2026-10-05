"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { RunPreview } from "@/harness/preview";
import { PreviewGraph } from "./preview-graph";
import { buildSchedule, layoutPreview, previewStats, REEL_MS } from "./preview-layout";

const STATIC_MS = 8000;
const SWIPE_PX = 40;

const CAPTION_COLOR: Record<string, string> = {
  assemble: "text-ice",
  done: "text-signal",
  objection: "text-coral",
  hitl: "text-coral",
  loop: "text-[#c792ea]",
  evaluate: "text-[#c792ea]",
  search: "text-cyan",
  fetch: "text-lime",
  compact: "text-signal",
};

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    (notify) => {
      document.addEventListener("visibilitychange", notify);
      return () => document.removeEventListener("visibilitychange", notify);
    },
    () => !document.hidden,
    () => true,
  );
}

type ReelState = { index: number; elapsed: number };
type ReelAction = { type: "tick"; dt: number; length: number; count: number } | { type: "go"; index: number; count: number };

function reelReducer(s: ReelState, a: ReelAction): ReelState {
  if (a.type === "go") return { index: ((a.index % a.count) + a.count) % a.count, elapsed: 0 };
  const elapsed = s.elapsed + a.dt;
  return elapsed >= a.length ? { index: (s.index + 1) % a.count, elapsed: 0 } : { ...s, elapsed };
}

/**
 * Landing-page hero: plays a compressed preview of each featured run in turn, so a visitor sees
 * several differently assembled teams within a minute without clicking anything.
 */
export function MissionReel({ previews }: { previews: RunPreview[] }) {
  const layouts = useMemo(() => previews.map(layoutPreview), [previews]);
  const schedules = useMemo(() => previews.map(buildSchedule), [previews]);
  const [{ index, elapsed }, dispatch] = useReducer(reelReducer, { index: 0, elapsed: 0 });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const pageVisible = usePageVisible();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 639px)");
  const rootRef = useRef<HTMLElement>(null);
  const swipe = useRef<{ x: number; swiped: boolean }>({ x: 0, swiped: false });

  const count = previews.length;
  const length = reduced ? STATIC_MS : REEL_MS;
  const running = count > 0 && !hovered && !focused && onScreen && pageVisible;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      dispatch({ type: "tick", dt: Math.min(now - last, 100), length, count });
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, length, count]);

  if (count === 0) return null;
  const preview = previews[index];
  const schedule = schedules[index];
  const caption = reduced
    ? { label: preview.headline ?? preview.title, kind: "done" }
    : (schedule.captions.findLast((c) => elapsed >= c.start) ?? schedule.captions[0]);
  const href = `/run/${preview.runId}?play=1`;
  const go = (i: number) => dispatch({ type: "go", index: i, count });

  return (
    <section
      ref={rootRef}
      aria-roledescription="carousel"
      aria-label="Featured runs, playing automatically"
      className="w-full"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(e) => {
        if (e.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="hud overflow-hidden">
        <div key={preview.runId} className="anim-reel" aria-roledescription="slide" aria-label={`Run ${index + 1} of ${count}: ${preview.title}`}>
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" style={{ animation: running ? "blink 1.4s ease-in-out infinite" : undefined }} aria-hidden />
            <span className="label !text-signal">Replay</span>
            {preview.taskClass && <span className="label">{preview.taskClass}</span>}
            <span className="num ml-auto text-[11px] text-ink-faint">
              {running ? `${index + 1} / ${count}` : "paused"}
            </span>
          </div>

          <p className="line-clamp-2 min-h-[2.8em] px-4 pt-3 text-[14.5px] leading-snug text-ice">{preview.question || preview.title}</p>

          <Link
            href={href}
            aria-label={`Open the full replay: ${preview.title}`}
            className="block touch-pan-y px-2 outline-none focus-visible:ring-1 focus-visible:ring-signal"
            onPointerDown={(e) => {
              swipe.current = { x: e.clientX, swiped: false };
            }}
            onPointerUp={(e) => {
              const dx = e.clientX - swipe.current.x;
              if (e.pointerType !== "mouse" && Math.abs(dx) > SWIPE_PX) {
                swipe.current.swiped = true;
                go(index + (dx < 0 ? 1 : -1));
              }
            }}
            onClick={(e) => {
              if (swipe.current.swiped) e.preventDefault();
            }}
          >
            <PreviewGraph
              preview={preview}
              layout={layouts[index]}
              schedule={schedule}
              time={reduced ? null : elapsed}
              labelChars={compact ? 13 : 16}
              className="mx-auto block h-auto w-full max-w-[460px]"
            />
          </Link>

          <p className={`line-clamp-2 min-h-[2.7em] px-4 text-[12.5px] leading-snug sm:line-clamp-1 sm:min-h-[1.4em] ${CAPTION_COLOR[caption.kind] ?? "text-ink-dim"}`}>
            {caption.label}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2.5">
            <span className="num flex flex-wrap gap-x-2 text-[11px] text-ink-faint">
              {previewStats(preview).map((s) => (
                <span key={s} className="whitespace-nowrap">
                  {s}
                </span>
              ))}
            </span>
            <Link href={href} className="label ml-auto !text-signal hover:!text-ice">
              Open full replay →
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-1.5" role="group" aria-label="Choose a featured run">
        {previews.map((p, i) => {
          const fill = i < index ? 1 : i === index ? Math.min(elapsed / length, 1) : 0;
          return (
            <button
              key={p.runId}
              type="button"
              onClick={() => go(i)}
              aria-label={`Play run ${i + 1}: ${p.title}`}
              aria-current={i === index ? "true" : undefined}
              title={p.title}
              className="group h-6 flex-1 cursor-pointer py-2.5"
            >
              <span className="block h-[3px] overflow-hidden rounded-full bg-line-bright/60 group-hover:bg-line-bright">
                <span className="block h-full bg-signal" style={{ width: `${fill * 100}%` }} />
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-faint">
        Every team is built at runtime by the orchestrator. Nothing here is a template.
      </p>
    </section>
  );
}
