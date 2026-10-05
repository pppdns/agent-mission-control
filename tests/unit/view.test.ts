import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EventBody, RunEvent } from "@/harness/events";
import { applyEvent, buildView, initialView, milestoneOf, type RunView } from "@/harness/view";

/** A real local run: two research rounds, compactions, retries, 7 checkpoints, no human decision. */
const LOG = JSON.parse(readFileSync(new URL("../fixtures/run-loop.json", import.meta.url), "utf8")) as RunEvent[];

function extend(base: RunEvent[], bodies: (EventBody & { agentId?: string | null })[]): RunEvent[] {
  let seq = base.at(-1)?.seq ?? 0;
  let ts = base.at(-1)?.ts ?? 0;
  return [...base, ...bodies.map((b) => ({ runId: "fixture", agentId: null, ...b, seq: ++seq, ts: (ts += 500) }) as RunEvent)];
}

describe("view reducer on a recorded run", () => {
  const view = buildView(LOG);

  it("projects the final state", () => {
    expect(view.phase).toBe("completed");
    expect(view.round).toBe(2);
    expect(view.checkpoints).toHaveLength(LOG.filter((e) => e.type === "checkpoint.created").length);
    expect(view.evaluations).toHaveLength(2);
    expect(view.loops).toHaveLength(1);
    expect(view.compactionOrder.length).toBeGreaterThan(0);
    expect(Object.values(view.compactions).every((c) => c.status === "done" && c.afterTokens < c.beforeTokens)).toBe(true);
    expect(view.totals.llmCalls).toBe(LOG.filter((e) => e.type === "llm.completed").length);
    expect(view.budget).not.toBeNull();
    expect(Object.values(view.llm).every((c) => c.status !== "running")).toBe(true);
    expect(Object.values(view.agents).every((a) => a.llmInFlight === 0 && a.toolsInFlight === 0)).toBe(true);
  });

  it("tracks per-agent context and retries", () => {
    const withContext = Object.values(view.agents).filter((a) => a.context);
    expect(withContext.length).toBeGreaterThan(0);
    for (const a of withContext) expect(a.context!.total).toBe(Object.values(a.context!.tokens).reduce((x, y) => x + y, 0));
    expect(Object.values(view.agents).reduce((n, a) => n + a.retries, 0)).toBe(LOG.filter((e) => e.type === "agent.retrying").length);
    expect(Object.values(view.agents).some((a) => a.round === 2)).toBe(true);
  });

  it("gives the same view whether events arrive one by one or in one pass", () => {
    let incremental = initialView();
    for (const e of LOG) incremental = applyEvent(incremental, e, 0);
    expect(incremental).toEqual(view);
  });

  it("is idempotent for duplicate or out-of-order events (stream reconnects)", () => {
    const twice = buildView([...LOG, ...LOG.slice(100, 200)]);
    expect(twice).toEqual(view);
  });

  it("rebuilds any cursor from cached snapshots exactly like a full rebuild (replay scrubbing)", () => {
    const EVERY = 100;
    const snaps: RunView[] = [initialView()];
    let tail = initialView();
    LOG.forEach((e, i) => {
      tail = applyEvent(tail, e, 0);
      if ((i + 1) % EVERY === 0) snaps.push(tail);
    });
    for (const t of [0, 1, 57, 100, 101, 250, LOG.length - 1, LOG.length]) {
      const k = Math.min(Math.floor(t / EVERY), snaps.length - 1);
      expect(buildView(LOG.slice(k * EVERY, t), snaps[k])).toEqual(buildView(LOG.slice(0, t)));
    }
  });

  it("marks replay milestones", () => {
    const kinds = LOG.map(milestoneOf).filter((m) => m !== null).map((m) => m!.kind);
    expect(kinds.filter((k) => k === "checkpoint")).toHaveLength(view.checkpoints.length);
    expect(kinds).toContain("loop");
    expect(kinds).toContain("compaction");
    expect(kinds.at(-1)).toBe("end");
  });

  it("counts searches from tool calls on logs recorded before budget snapshots", () => {
    const legacy = buildView(LOG.filter((e) => e.type !== "budget.updated"));
    expect(legacy.budget).toBeNull();
    expect(legacy.totals.searches).toBeGreaterThan(0);
    expect(legacy.totals.searches).toBeLessThanOrEqual(view.totals.searches);
  });
});

describe("view reducer on a recorded run with a human decision", () => {
  /** Low-context local run: three rounds, a budget decision auto-answered with the extension, five compactions. */
  const HITL_LOG = JSON.parse(readFileSync(new URL("../fixtures/run-hitl.json", import.meta.url), "utf8")) as RunEvent[];
  const view = buildView(HITL_LOG);

  it("records the decision, the extension and the extra round", () => {
    expect(view.phase).toBe("completed");
    expect(view.hitlOrder).toHaveLength(1);
    const h = view.hitl[view.hitlOrder[0]];
    expect(h.status).toBe("resolved");
    expect(h.reason).toBe("budget");
    expect(h.options.map((o) => o.id)).toContain(h.optionId);
    expect(view.pendingHitl).toBeNull();
    expect(view.budgetExtension).not.toBeNull();
    expect(view.budget?.extended).toBe(true);
    expect(view.loops.map((l) => l.round)).toEqual([2, 3]);
    expect(view.evaluations.map((e) => e.decision)).toEqual(["loop", "ask_human", "synthesize"]);
  });

  it("pauses the view exactly while the decision is pending", () => {
    const requested = HITL_LOG.findIndex((e) => e.type === "hitl.requested");
    const resolved = HITL_LOG.findIndex((e) => e.type === "hitl.resolved");
    expect(buildView(HITL_LOG.slice(0, requested + 1)).phase).toBe("paused");
    expect(buildView(HITL_LOG.slice(0, resolved + 1)).phase).toBe("running");
  });

  it("keeps compactions with both strategies", () => {
    const strategies = new Set(Object.values(view.compactions).map((c) => c.strategy));
    expect(strategies.has("prune")).toBe(true);
    expect(strategies.has("summarize")).toBe(true);
  });
});

describe("view reducer: resume and human decisions", () => {
  it("rolls back to the checkpoint state when a crashed run resumes", () => {
    const cut = LOG.findIndex((e, i) => e.type === "llm.requested" && i > 150);
    const partial = LOG.slice(0, cut + 1);
    const before = buildView(partial);
    const runningCall = Object.values(before.llm).find((c) => c.status === "running")!;
    expect(runningCall).toBeDefined();
    const keepAgents = Object.fromEntries(before.agentOrder.slice(0, 3).map((id) => [id, "completed" as const]));
    const keepSources = before.sourceOrder.slice(0, 2);

    const after = buildView(
      extend(partial, [
        {
          type: "run.resumed",
          data: { checkpointId: "cp2", phase: "research", round: 1, reason: "attempt 2", artifact: null, agentStatus: keepAgents, sourceIds: keepSources, messageIds: [] },
        },
      ]),
    );
    expect(after.phase).toBe("running");
    expect(after.llm[runningCall.callId].status).toBe("interrupted");
    expect(after.agentOrder).toEqual(Object.keys(keepAgents));
    expect(after.sourceOrder).toEqual(keepSources);
    expect(after.messages).toHaveLength(0);
    expect(after.resumes).toHaveLength(1);
    expect(after.trace.at(-1)).toMatchObject({ kind: "checkpoint", ref: { type: "checkpoint", id: "cp2" } });
  });

  it("pauses on a human decision and resumes when it is answered", () => {
    const base = LOG.slice(0, 200);
    const options = [
      { id: "more", label: "Research more", description: "", action: "research_more" as const, gapIndex: null },
      { id: "continue", label: "Write the brief", description: "", action: "continue" as const, gapIndex: null },
    ];
    const requested = extend(base, [
      { type: "hitl.requested", agentId: "orchestrator", data: { requestId: "h1", reason: "conflict", question: "Which way?", context: "", options, recommended: "more", timeoutMs: 90_000, deadlineTs: 1 } },
    ]);
    const paused = buildView(requested);
    expect(paused.phase).toBe("paused");
    expect(paused.pendingHitl).toBe("h1");

    const resolved = buildView(extend(requested, [{ type: "hitl.resolved", data: { requestId: "h1", optionId: "continue", resolvedBy: "visitor", waitedMs: 12_000 } }]));
    expect(resolved.phase).toBe("running");
    expect(resolved.pendingHitl).toBeNull();
    expect(resolved.hitl.h1).toMatchObject({ status: "resolved", optionId: "continue", resolvedBy: "visitor" });
    expect(resolved.trace.at(-1)).toMatchObject({ agentId: "visitor", title: 'Visitor chose "Write the brief"' });
  });
});
