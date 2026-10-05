import type { BudgetExtension, ContextBudget, Limits, Provider, RouteName, RuleName } from "./types";

export const DEFAULT_LIMITS: Limits = {
  maxInputChars: 2000,
  maxAgents: 8,
  maxLlmCalls: 45,
  maxWebSearches: 12,
  maxPageFetches: 3,
  maxRunMs: 7.5 * 60 * 1000,
  maxCostUsd: 0.75,
  workerStepLimit: 5,
  editorReserveCalls: 4,
  maxResearchLoops: 2,
  loopSearchReserve: 2,
  maxHitlRequests: 2,
  hitlTimeoutMs: 5 * 60 * 1000,
  synthesisGraceMs: 2 * 60 * 1000,
};

/** The one-time research budget extension a visitor can approve. */
export const BUDGET_EXTENSION: BudgetExtension = {
  searches: 3,
  fetches: 1,
  llmCalls: 8,
  costUsd: 0.2,
  runMs: 90_000,
};

/**
 * Demo-sized working context budgets, deliberately small so compaction happens during a normal run.
 * Workers run tool loops; synthesis roles make one large structured call with a big output reserve.
 */
export const CONTEXT_BUDGETS: Record<"worker" | "synthesis", ContextBudget> = {
  worker: { windowTokens: 12_000, compactAtTokens: 7_000, reservedOutputTokens: 3_000 },
  synthesis: { windowTokens: 24_000, compactAtTokens: 12_000, reservedOutputTokens: 9_000 },
};

/** Inputs above this are too large for the cheap route, so the router escalates them. */
export const LARGE_CONTEXT_TOKENS = 20_000;

export interface ModelSpec {
  id: string;
  provider: Provider;
  /** USD per million tokens */
  inputPerM: number;
  cachedInputPerM: number;
  outputPerM: number;
  cacheWritePerM: number;
  reasoning: "none" | "minimal" | "low" | "medium" | "high" | null;
}

export const MODELS: Record<string, ModelSpec> = {
  "gpt-6.1-sol": {
    id: "gpt-6.1-sol",
    provider: "openai",
    inputPerM: 2,
    cachedInputPerM: 0.1,
    outputPerM: 10,
    cacheWritePerM: 2,
    reasoning: "low",
  },
  "gpt-6-luna": {
    id: "gpt-6-luna",
    provider: "openai",
    inputPerM: 0.1,
    cachedInputPerM: 0.01,
    outputPerM: 0.5,
    cacheWritePerM: 0.1,
    reasoning: "low",
  },
  "claude-sonnet-5-5": {
    id: "claude-sonnet-5-5",
    provider: "anthropic",
    inputPerM: 2,
    cachedInputPerM: 0.2,
    outputPerM: 10,
    cacheWritePerM: 2.5,
    reasoning: null,
  },
};

export interface RouteSpec {
  name: RouteName;
  model: string;
  fallback: string;
  reason: string;
}

export const ROUTES: Record<RouteName, RouteSpec> = {
  complex: {
    name: "complex",
    model: "gpt-6.1-sol",
    fallback: "claude-sonnet-5-5",
    reason: "Planning, gap analysis and synthesis need the strongest reasoning model.",
  },
  simple: {
    name: "simple",
    model: "gpt-6-luna",
    fallback: "claude-sonnet-5-5",
    reason: "Parallel research tool loops are cheap and latency-sensitive.",
  },
  critique: {
    name: "critique",
    model: "claude-sonnet-5-5",
    fallback: "gpt-6.1-sol",
    reason: "Critics run on a different model family than the agents they review, so they do not share blind spots.",
  },
};

/** The single place where routing rules live. `route: null` rules adjust another decision instead of choosing a route. */
export const ROUTING_RULES: Record<RuleName, { route: RouteName | null; reason: string }> = {
  complex_planning: { route: "complex", reason: "Orchestration and planning decide the shape of the whole run." },
  simple_parallel_research: { route: "simple", reason: "Parallel research tool loops are cheap and latency-sensitive." },
  critique_cross_family: {
    route: "critique",
    reason: "Reviews other agents' work, so it runs on a different model family than the agents it checks.",
  },
  complex_gap_detection: { route: "complex", reason: "Deciding whether the evidence is enough is a judgment call that drives the loop." },
  complex_synthesis: { route: "complex", reason: "Final synthesis is the quality-critical step." },
  simple_compaction: { route: "simple", reason: "Summarizing older turns is extraction work; the cheap model does it well." },
  escalate_large_context: {
    route: "complex",
    reason: `Input exceeds ${LARGE_CONTEXT_TOKENS.toLocaleString("en-US")} tokens, more than the cheap route should handle; escalated.`,
  },
  fallback_provider_error: { route: null, reason: "The primary provider failed, so the call falls back to the other provider." },
};

export const SEARCH_RESULTS_PER_QUERY = 5;
export const FETCH_CHAR_LIMIT = 7000;
export const EVENT_PREVIEW_CHARS = 3500;
