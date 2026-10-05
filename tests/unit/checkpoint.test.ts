import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactManager } from "@/harness/artifact";
import { BudgetTracker } from "@/harness/budget";
import { CheckpointManager } from "@/harness/checkpoints";
import { BUDGET_EXTENSION } from "@/harness/config";
import { ContextManager } from "@/harness/context-window";
import { EventBus } from "@/harness/events";
import { EvidenceStore } from "@/harness/evidence";
import { MemoryStore } from "@/harness/store";
import { LIMITS, testBus } from "./helpers";

/** Checkpoints are stored as jsonb, so a snapshot must survive a JSON round trip unchanged. */
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

afterEach(() => {
  vi.useRealTimers();
});

function populated() {
  const { bus } = testBus();
  const store = new MemoryStore();
  const evidence = new EvidenceStore("run", bus, store);
  const artifact = new ArtifactManager("run", bus, store, evidence);
  const budget = new BudgetTracker(LIMITS, bus);
  const contexts = new ContextManager(bus);

  const a = evidence.add({ url: "https://example.com/a", title: "A", snippet: "a", content: "alpha", via: "web_search", agentId: "researcher-1", query: "q" });
  evidence.add({ url: "https://example.com/b", title: "B", snippet: "b", content: "beta", via: "fetch_page", agentId: "researcher-2", query: null });
  artifact.create("Fasting vs restriction", "orchestrator");
  artifact.append("key_findings", [{ kind: "claim", text: "Both work", sourceIds: [a.id], confidence: "medium" }], "researcher-1", "first claim");

  budget.setSearchAllowance("researcher-1", 3);
  budget.reserve("search", "researcher-1");
  budget.recordLlm({ inputTokens: 1200, outputTokens: 300, cachedTokens: 0, costUsd: 0.012 });
  budget.setLoopReserve(2);
  contexts.calibrate("researcher-1", 1000, 1400);
  contexts.nextCompactionId();

  return { bus, store, evidence, artifact, budget, contexts };
}

describe("checkpoint round trip", () => {
  it("restores evidence, artifact, budget and context calibration from a JSON snapshot", () => {
    vi.useFakeTimers();
    const src = populated();
    src.budget.pause();
    const snap = viaJson({
      evidence: src.evidence.snapshot(),
      artifact: src.artifact.serialize(),
      budget: src.budget.serialize(),
      contexts: src.contexts.snapshot(),
    });

    const dst = (() => {
      const { bus } = testBus();
      const store = new MemoryStore();
      const evidence = new EvidenceStore("run", bus, store);
      return { evidence, artifact: new ArtifactManager("run", bus, store, evidence), budget: new BudgetTracker(LIMITS, bus), contexts: new ContextManager(bus) };
    })();
    dst.evidence.restore(snap.evidence);
    dst.artifact.restore(snap.artifact);
    dst.budget.restore(snap.budget, null);
    dst.contexts.restore(snap.contexts);
    dst.budget.pause();

    expect(dst.evidence.snapshot()).toEqual(src.evidence.snapshot());
    expect(dst.artifact.serialize()).toEqual(src.artifact.serialize());
    expect(dst.budget.serialize()).toEqual(src.budget.serialize());
    expect(dst.contexts.snapshot()).toEqual(src.contexts.snapshot());

    // Counters continue instead of reusing ids.
    const next = dst.evidence.add({ url: "https://example.com/c", title: "C", snippet: "c", content: "gamma", via: "web_search", agentId: "researcher-1", query: "q" });
    expect(src.evidence.all().map((s) => s.id)).not.toContain(next.id);
    expect(dst.evidence.add({ url: "https://example.com/a/", title: "A again", snippet: "", content: "", via: "web_search", agentId: "x", query: null }).id).toBe(
      src.evidence.all()[0].id,
    );
    expect(dst.contexts.nextCompactionId()).toBe("cmp2");
    expect(dst.budget.allowanceFor("researcher-1")).toBe(3);
  });

  it("lets synced totals win over the checkpoint: interrupted work still cost money", () => {
    const src = populated();
    const dst = new BudgetTracker(LIMITS, testBus().bus);
    dst.restore(viaJson(src.budget.serialize()), { ...src.budget.totals, llmCalls: 5, costUsd: 0.2 });
    expect(dst.totals.llmCalls).toBe(5);
    expect(dst.totals.costUsd).toBe(0.2);
    expect(dst.totals.searches).toBe(1);
  });

  it("keeps the one-time extension across a restore", () => {
    const src = populated();
    src.budget.extend(BUDGET_EXTENSION, "approved");
    const dst = new BudgetTracker(LIMITS, testBus().bus);
    dst.restore(viaJson(src.budget.serialize()), null);
    expect(dst.wasExtended).toBe(true);
    expect(dst.limits.maxWebSearches).toBe(LIMITS.maxWebSearches + BUDGET_EXTENSION.searches);
    dst.extend(BUDGET_EXTENSION, "again");
    expect(dst.limits.maxWebSearches).toBe(LIMITS.maxWebSearches + BUDGET_EXTENSION.searches);
  });

  it("does not count paused time against the run clock", () => {
    vi.useFakeTimers();
    const budget = new BudgetTracker(LIMITS, testBus().bus);
    vi.advanceTimersByTime(10_000);
    budget.pause();
    vi.advanceTimersByTime(120_000);
    budget.resume();
    vi.advanceTimersByTime(5_000);
    expect(budget.elapsedMs).toBe(15_000);
  });

  it("CheckpointManager flushes events before saving and the store returns the latest checkpoint", async () => {
    const store = new MemoryStore();
    const flushed: number[] = [];
    const original = store.append.bind(store);
    store.append = async (runId, events) => {
      flushed.push(...events.map((e) => e.seq));
      return original(runId, events);
    };
    const busWithStore = new EventBus("run", store);
    const checkpoints = new CheckpointManager("run", busWithStore, store);

    busWithStore.emit({ type: "agent.note", data: { text: "before" } }, "orchestrator");
    const id1 = await checkpoints.save("research", 1, "Research done", () => ({ value: 1 }));
    const id2 = await checkpoints.save("evaluate", 1, "Evaluated", () => ({ value: 2 }));

    expect([id1, id2]).toEqual(["cp1", "cp2"]);
    const point = await store.loadResumePoint();
    expect(point.checkpoint).toMatchObject({ id: "cp2", phase: "evaluate", state: { value: 2 } });
    // The checkpoint's seq is already persisted when the snapshot is written.
    expect(flushed).toContain(store.checkpoints[0].seq);
    expect(point.lastSeq).toBe(store.checkpoints[1].seq);

    const restored = new CheckpointManager("run", busWithStore, store);
    restored.restore({ counter: checkpoints.count });
    expect(await restored.save("synthesize", 1, "Next", () => null)).toBe("cp3");
  });
});
