import type { ModelMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { BudgetTracker } from "@/harness/budget";
import { Compactor, ContextManager, loopMessages, type LoopContext, type Pruner } from "@/harness/context-window";
import type { RunEvent } from "@/harness/events";
import type { LlmClient } from "@/harness/models";
import type { ContextBudget } from "@/harness/types";
import { agentInfo, testBus } from "./helpers";

const BUDGET: ContextBudget = { windowTokens: 8000, compactAtTokens: 1500, reservedOutputTokens: 500 };

function result(n: number): string {
  return Array.from({ length: 12 }, (_, i) => `[s${n * 10 + i}] Source ${n}-${i}: ${"finding ".repeat(36)}`).join("\n");
}

function toolTurn(n: number): ModelMessage[] {
  return [
    { role: "assistant", content: [{ type: "tool-call", toolCallId: `t${n}`, toolName: "web_search", input: { query: `query ${n}` } }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: `t${n}`, toolName: "web_search", output: { type: "text", value: result(n) } }] },
  ];
}

function loop(turns = 3): LoopContext {
  return { system: "You are a researcher.", working: "MISSION: test", retrieved: "", notes: null, turns: Array.from({ length: turns }, (_, i) => toolTurn(i + 1)).flat() };
}

/** Every tool result must follow an assistant turn that made the matching call. */
function assertPaired(turns: ModelMessage[]) {
  const calls = new Set<string>();
  for (const m of turns) {
    if (typeof m.content === "string") continue;
    for (const part of m.content) {
      if (part.type === "tool-call") calls.add(part.toolCallId);
      if (part.type === "tool-result") expect(calls.has(part.toolCallId), `orphaned tool result ${part.toolCallId}`).toBe(true);
    }
  }
}

function setup(llmCall: () => Promise<unknown>) {
  const { bus } = testBus();
  const events: RunEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const contexts = new ContextManager(bus);
  const llm = { call: vi.fn(llmCall) } as unknown as LlmClient;
  const budget = { workerCallsLeft: () => 5 } as unknown as BudgetTracker;
  return { compactor: new Compactor(bus, llm, budget, contexts), contexts, events, llm };
}

const total = (contexts: ContextManager, c: LoopContext) => Object.values(contexts.breakdownLoop("researcher-1", c)).reduce((a, b) => a + b, 0);

describe("Compactor.compactLoop", () => {
  it("summarizes older tool turns and keeps the latest call with its result", async () => {
    const { compactor, contexts, events, llm } = setup(async () => ({
      callId: "c1",
      structured: { notes: [{ text: "Fasting and restriction perform similarly at 12 months", sourceIds: ["s10"] }], openThreads: ["long-term adherence"] },
    }));
    const c = loop(3);
    const before = total(contexts, c);
    expect(before).toBeGreaterThan(BUDGET.compactAtTokens);

    expect(await compactor.compactLoop(agentInfo(), c, BUDGET)).toBe(true);

    expect(llm.call).toHaveBeenCalledOnce();
    expect(c.turns).toHaveLength(2);
    expect(c.turns[0].role).toBe("assistant");
    assertPaired(c.turns);
    assertPaired(loopMessages(c));
    expect(c.notes).toContain("[s10]");
    expect(c.notes).toContain("Open threads: long-term adherence");
    expect(total(contexts, c)).toBeLessThan(before);

    const done = events.find((e) => e.type === "context.compacted");
    expect(done).toMatchObject({ data: { strategy: "summarize", llmCallId: "c1", beforeTokens: before } });
    expect(events.map((e) => e.type)).toEqual(["context.threshold_reached", "context.compacting", "context.compacted"]);
  });

  it("falls back to deterministic truncation when the summary call fails", async () => {
    const { compactor, events } = setup(async () => {
      throw new Error("provider down");
    });
    const c = loop(3);
    expect(await compactor.compactLoop(agentInfo(), c, BUDGET)).toBe(true);
    assertPaired(c.turns);
    expect(c.notes).toMatch(/^- \[s10\] Source 1-0/);
    expect(events.find((e) => e.type === "context.compacted")).toMatchObject({ data: { strategy: "truncate", llmCallId: null } });
  });

  it("prunes handed-in material first and skips the LLM when that is enough", async () => {
    const { compactor, events, llm } = setup(async () => ({}));
    const c: LoopContext = { ...loop(1), retrieved: "BRIEF\n" + "evidence ".repeat(1200) };
    const prune: Pruner = (level) => ({ text: level === 1 ? "BRIEF (pruned)" : "BRIEF", removed: ["source excerpts"], summarized: [], preserved: ["source ids"] });

    expect(await compactor.compactLoop(agentInfo(), c, BUDGET, prune)).toBe(true);
    expect(llm.call).not.toHaveBeenCalled();
    expect(c.retrieved).toBe("BRIEF (pruned)");
    expect(c.pruneLevel).toBe(1);
    expect(c.turns).toHaveLength(2);
    expect(events.find((e) => e.type === "context.compacted")).toMatchObject({ data: { strategy: "prune" } });
  });

  it("does nothing when the older turns are too small to be worth summarizing", async () => {
    const { compactor, events, llm } = setup(async () => ({}));
    const c: LoopContext = {
      ...loop(0),
      turns: [
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "a", toolName: "web_search", input: { query: "q" } }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "a", toolName: "web_search", output: { type: "text", value: "[s1] short" } }] },
        ...toolTurn(2),
      ],
    };
    expect(await compactor.compactLoop(agentInfo(), c, BUDGET)).toBe(false);
    expect(llm.call).not.toHaveBeenCalled();
    expect(events).toHaveLength(0);
    expect(c.turns).toHaveLength(4);
  });
});
