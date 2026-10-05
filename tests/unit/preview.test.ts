import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/harness/events";
import { buildPreview, MAX_MOMENTS, PREVIEW_VERSION } from "@/harness/preview";
import { buildView } from "@/harness/view";
import { buildSchedule, layoutPreview, REEL, REEL_MS } from "@/components/preview-layout";

const load = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8")) as RunEvent[];

describe.each(["run-loop", "run-hitl"])("preview digest of %s", (name) => {
  const log = load(name);
  const view = buildView(log);
  const preview = buildPreview(log, { id: name, title: null, prompt: null });

  it("keeps the whole team in spawn order", () => {
    expect(preview.v).toBe(PREVIEW_VERSION);
    expect(preview.agents.map((a) => a.id)).toEqual(view.agentOrder);
    expect(preview.agents[0].role).toBe("orchestrator");
    expect(preview.agents.every((a, i) => i === 0 || a.at >= preview.agents[i - 1].at)).toBe(true);
    expect(new Set(preview.agents.map((a) => a.name)).size).toBe(preview.agents.length);
  });

  it("samples a bounded, ordered set of key moments", () => {
    expect(preview.moments.length).toBeGreaterThan(8);
    expect(preview.moments.length).toBeLessThanOrEqual(MAX_MOMENTS);
    expect(preview.moments.every((m, i) => i === 0 || m.at >= preview.moments[i - 1].at)).toBe(true);
    expect(preview.moments.every((m) => m.at >= 0 && m.at <= 1)).toBe(true);
    const kinds = new Set(preview.moments.map((m) => m.kind));
    for (const kind of ["delegate", "search", "evaluate", "loop", "done"] as const) expect(kinds).toContain(kind);
    expect(preview.moments.at(-1)?.kind).toBe("done");
  });

  it("detects rounds and carries the outcome", () => {
    expect(preview.rounds).toBe(view.round);
    expect(preview.rounds).toBeGreaterThan(1);
    expect(preview.title.length).toBeGreaterThan(5);
    expect(preview.question).toBe(view.prompt);
    expect(preview.headline).toBeTruthy();
    expect(preview.totals.llmCalls).toBe(view.totals.llmCalls);
    expect(preview.durationMs).toBeGreaterThan(0);
  });

  it("stays small", () => {
    expect(JSON.stringify(preview).length).toBeLessThan(20_000);
  });
});

it("schedules every agent and moment inside one reel", () => {
  for (const name of ["run-loop", "run-hitl"]) {
    const preview = buildPreview(load(name), { id: name });
    const layout = layoutPreview(preview);
    const schedule = buildSchedule(preview);
    for (const a of preview.agents) {
      expect(layout.byId.has(a.id)).toBe(true);
      expect(schedule.appear.get(a.id)).toBeLessThanOrEqual(REEL_MS);
    }
    expect(schedule.moments.every((s, i) => s.start < REEL_MS && (i === 0 || s.start >= schedule.moments[i - 1].start))).toBe(true);
    expect(schedule.captions[0].kind).toBe("assemble");
    expect(schedule.captions.at(-1)?.kind).toBe("done");
    expect(schedule.captions.length).toBeGreaterThanOrEqual(4);
    const later = preview.agents.find((a) => a.round > 1);
    if (later) expect(schedule.appear.get(later.id)).toBeGreaterThan(REEL.assembleMs - 1);
  }
});

it("includes the human decision when there was one", () => {
  const preview = buildPreview(load("run-hitl"), { id: "hitl" });
  expect(preview.moments.some((m) => m.kind === "hitl" && m.to.includes("visitor"))).toBe(true);
});
