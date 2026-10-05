import type { EventBus } from "./events";
import type { BudgetExtension, BudgetSnapshot, Limits, Totals } from "./types";
import { EMPTY_TOTALS } from "./types";

export type BudgetKey = "search" | "fetch";

/** Active time kept free for the final synthesis; research stops once less than this is left. */
const SYNTHESIS_TIME_RESERVE_MS = 90_000;

export interface BudgetState {
  totals: Totals;
  limits: Limits;
  activeMs: number;
  exhaustedReason: string | null;
  extended: boolean;
  loopReserve: number;
  allowance: Record<string, number>;
  used: Record<string, number>;
}

export class BudgetTracker {
  readonly totals: Totals = { ...EMPTY_TOTALS };
  /** Mutable copy: an approved extension raises it. */
  readonly limits: Limits;
  private activeBefore = 0;
  private activeSince: number | null = Date.now();
  private exhaustedReason: string | null = null;
  private extended = false;
  private loopReserve = 0;
  private readonly agentAllowance = new Map<string, number>();
  private readonly agentUsed = new Map<string, number>();

  constructor(
    limits: Limits,
    private readonly bus: EventBus,
  ) {
    this.limits = { ...limits };
  }

  /** Active run time. Time spent paused (waiting on a human) does not count. */
  get elapsedMs() {
    return this.activeBefore + (this.activeSince === null ? 0 : Date.now() - this.activeSince);
  }

  pause() {
    if (this.activeSince === null) return;
    this.activeBefore += Date.now() - this.activeSince;
    this.activeSince = null;
  }

  resume() {
    if (this.activeSince !== null) return;
    this.activeSince = Date.now();
  }

  recordLlm(usage: { inputTokens: number; outputTokens: number; cachedTokens: number; costUsd: number }) {
    this.totals.llmCalls += 1;
    this.totals.inputTokens += usage.inputTokens;
    this.totals.outputTokens += usage.outputTokens;
    this.totals.cachedTokens += usage.cachedTokens;
    this.totals.costUsd += usage.costUsd;
    this.checkSoftLimits();
    this.publish();
  }

  setSearchAllowance(agentId: string, allowance: number) {
    this.agentAllowance.set(agentId, allowance);
  }

  /** Give an agent `extra` more searches on top of what it has already used. */
  grantSearches(agentId: string, extra: number) {
    this.agentAllowance.set(agentId, (this.agentUsed.get(agentId) ?? 0) + extra);
  }

  setLoopReserve(searches: number) {
    this.loopReserve = searches;
  }

  allowanceFor(agentId: string): number | null {
    return this.agentAllowance.get(agentId) ?? null;
  }

  canUse(key: BudgetKey, agentId: string): boolean {
    if (this.exhaustedReason) return false;
    if (key === "fetch") return this.totals.fetches < this.limits.maxPageFetches;
    if (this.totals.searches >= this.limits.maxWebSearches) return false;
    const allowance = this.agentAllowance.get(agentId);
    return allowance === undefined || (this.agentUsed.get(agentId) ?? 0) < allowance;
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
    this.publish();
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

  get wasExtended(): boolean {
    return this.extended;
  }

  /** Workers must leave a few LLM calls for the gap detector and the editor. */
  workerCallsLeft(): number {
    return this.limits.maxLlmCalls - this.limits.editorReserveCalls - this.totals.llmCalls;
  }

  /** Room for another research round: a search to run and enough calls for a short tool loop. */
  canAffordLoop(): boolean {
    return !this.exhausted && this.remaining().searches > 0 && this.workerCallsLeft() >= 4;
  }

  /** Hard stop for any call, including the editor's. */
  hardLimitReason(): string | null {
    if (this.totals.llmCalls >= this.limits.maxLlmCalls) return "LLM call limit reached";
    if (this.totals.costUsd >= this.limits.maxCostUsd * 1.5) return "cost cap exceeded";
    if (this.elapsedMs >= this.limits.maxRunMs + this.limits.synthesisGraceMs) return "run time limit reached";
    return null;
  }

  /** One-time, bounded extension approved by the visitor. Clears exhaustion if the new limits leave headroom. */
  extend(extension: BudgetExtension, reason: string) {
    if (this.extended) return;
    this.extended = true;
    this.limits.maxWebSearches += extension.searches;
    this.limits.maxPageFetches += extension.fetches;
    this.limits.maxLlmCalls += extension.llmCalls;
    this.limits.maxCostUsd += extension.costUsd;
    this.limits.maxRunMs += extension.runMs;
    this.exhaustedReason = null;
    this.bus.emit({ type: "budget.extended", data: { extension, reason } });
    this.checkSoftLimits();
    this.publish();
  }

  snapshot(): BudgetSnapshot {
    const allowances: BudgetSnapshot["allowances"] = {};
    for (const [id, allowance] of this.agentAllowance) allowances[id] = { allowance, used: this.agentUsed.get(id) ?? 0 };
    return {
      searches: { used: this.totals.searches, limit: this.limits.maxWebSearches },
      fetches: { used: this.totals.fetches, limit: this.limits.maxPageFetches },
      llmCalls: { used: this.totals.llmCalls, limit: this.limits.maxLlmCalls },
      costUsd: { used: this.totals.costUsd, limit: this.limits.maxCostUsd },
      activeMs: this.elapsedMs,
      maxRunMs: this.limits.maxRunMs,
      allowances,
      loopReserve: this.loopReserve,
      extended: this.extended,
      exhausted: this.exhaustedReason,
    };
  }

  publish() {
    this.bus.emit({ type: "budget.updated", data: { snapshot: this.snapshot() } });
  }

  serialize(): BudgetState {
    return {
      totals: { ...this.totals },
      limits: { ...this.limits },
      activeMs: this.elapsedMs,
      exhaustedReason: this.exhaustedReason,
      extended: this.extended,
      loopReserve: this.loopReserve,
      allowance: Object.fromEntries(this.agentAllowance),
      used: Object.fromEntries(this.agentUsed),
    };
  }

  /** Restores a checkpoint. `spent` (the run's synced totals) wins where it is higher: interrupted work still cost money. */
  restore(state: BudgetState, spent: Totals | null) {
    Object.assign(this.totals, state.totals);
    if (spent) {
      for (const key of Object.keys(this.totals) as (keyof Totals)[]) {
        this.totals[key] = Math.max(this.totals[key], spent[key] ?? 0);
      }
    }
    Object.assign(this.limits, state.limits);
    this.activeBefore = state.activeMs;
    this.activeSince = Date.now();
    this.exhaustedReason = state.exhaustedReason;
    this.extended = state.extended;
    this.loopReserve = state.loopReserve;
    this.agentAllowance.clear();
    this.agentUsed.clear();
    for (const [id, n] of Object.entries(state.allowance)) this.agentAllowance.set(id, n);
    for (const [id, n] of Object.entries(state.used)) this.agentUsed.set(id, n);
  }

  private checkSoftLimits() {
    if (this.exhaustedReason) return;
    let reason: string | null = null;
    if (this.totals.costUsd >= this.limits.maxCostUsd) reason = `cost cap $${this.limits.maxCostUsd.toFixed(2)} reached`;
    else if (this.workerCallsLeft() <= 0) reason = `${this.limits.maxLlmCalls - this.limits.editorReserveCalls} of ${this.limits.maxLlmCalls} LLM calls used`;
    else if (this.elapsedMs >= this.limits.maxRunMs - Math.min(SYNTHESIS_TIME_RESERVE_MS, this.limits.maxRunMs * 0.3)) {
      reason = "run time budget nearly used";
    }
    if (reason) {
      this.exhaustedReason = reason;
      this.bus.emit({ type: "budget.exhausted", data: { reason } });
    }
  }
}
