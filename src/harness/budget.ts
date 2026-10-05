import type { EventBus } from "./events";
import type { Limits, Totals } from "./types";
import { EMPTY_TOTALS } from "./types";

export type BudgetKey = "search" | "fetch";

export class BudgetTracker {
  readonly totals: Totals = { ...EMPTY_TOTALS };
  private readonly startedAt = Date.now();
  private exhaustedReason: string | null = null;
  private readonly agentAllowance = new Map<string, number>();
  private readonly agentUsed = new Map<string, number>();

  constructor(
    readonly limits: Limits,
    private readonly bus: EventBus,
  ) {}

  get elapsedMs() {
    return Date.now() - this.startedAt;
  }

  recordLlm(usage: { inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number }) {
    this.totals.llmCalls += 1;
    this.totals.inputTokens += usage.inputTokens;
    this.totals.outputTokens += usage.outputTokens;
    this.totals.cachedTokens += usage.cachedTokens;
    this.totals.costUsd += usage.costUsd;
    this.checkSoftLimits();
  }

  setSearchAllowance(agentId: string, allowance: number) {
    this.agentAllowance.set(agentId, allowance);
  }

  allowanceFor(agentId: string): number | null {
    return this.agentAllowance.get(agentId) ?? null;
  }

  /** Reserve one external call. Returns a refusal reason, or null when allowed. */
  reserve(key: BudgetKey, agentId: string): string | null {
    if (this.exhaustedReason) return `Research budget exhausted (${this.exhaustedReason}).`;
    if (key === "search") {
      if (this.totals.searches >= this.limits.maxWebSearches) return "Run-wide web search budget is used up.";
      const allowance = this.agentAllowance.get(agentId);
      const used = this.agentUsed.get(agentId) ?? 0;
      if (allowance !== undefined && used >= allowance) {
        return `Your personal web search allowance (${allowance}) is used up.`;
      }
      this.agentUsed.set(agentId, used + 1);
      this.totals.searches += 1;
    } else {
      if (this.totals.fetches >= this.limits.maxPageFetches) return "Run-wide page fetch budget is used up.";
      this.totals.fetches += 1;
    }
    return null;
  }

  remaining() {
    return {
      searches: Math.max(0, this.limits.maxWebSearches - this.totals.searches),
      fetches: Math.max(0, this.limits.maxPageFetches - this.totals.fetches),
      llmCalls: Math.max(0, this.limits.maxLlmCalls - this.totals.llmCalls),
      costUsd: Math.max(0, this.limits.maxCostUsd - this.totals.costUsd),
      msLeft: Math.max(0, this.limits.maxRunMs - this.elapsedMs),
    };
  }

  /** True once workers must stop researching and hand over to synthesis. */
  get exhausted(): boolean {
    this.checkSoftLimits();
    return this.exhaustedReason !== null;
  }

  get exhaustedBecause(): string | null {
    return this.exhaustedReason;
  }

  /** Workers must leave a few LLM calls for the editor. */
  workerCallsLeft(): number {
    return this.limits.maxLlmCalls - this.limits.editorReserveCalls - this.totals.llmCalls;
  }

  /** Hard stop for any call, including the editor's. */
  hardLimitReason(): string | null {
    if (this.totals.llmCalls >= this.limits.maxLlmCalls) return "LLM call limit reached";
    if (this.totals.costUsd >= this.limits.maxCostUsd * 1.5) return "cost cap exceeded";
    return null;
  }

  private checkSoftLimits() {
    if (this.exhaustedReason) return;
    let reason: string | null = null;
    if (this.totals.costUsd >= this.limits.maxCostUsd) reason = `cost cap $${this.limits.maxCostUsd.toFixed(2)} reached`;
    else if (this.workerCallsLeft() <= 0) reason = `${this.limits.maxLlmCalls - this.limits.editorReserveCalls} of ${this.limits.maxLlmCalls} LLM calls used`;
    else if (this.elapsedMs >= this.limits.maxRunMs * 0.7) reason = "run time budget nearly used";
    if (reason) {
      this.exhaustedReason = reason;
      this.bus.emit({ type: "budget.exhausted", data: { reason } });
    }
  }
}
