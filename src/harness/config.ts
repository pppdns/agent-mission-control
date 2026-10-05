import type { Limits, Provider, RouteName } from "./types";

export const DEFAULT_LIMITS: Limits = {
  maxInputChars: 2000,
  maxAgents: 6,
  maxLlmCalls: 30,
  maxWebSearches: 8,
  maxPageFetches: 2,
  maxRunMs: 5 * 60 * 1000,
  maxCostUsd: 0.5,
  workerStepLimit: 5,
  editorReserveCalls: 4,
};

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

/** The single place where routing decisions live. */
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

export const SEARCH_RESULTS_PER_QUERY = 5;
export const FETCH_CHAR_LIMIT = 7000;
export const EVENT_PREVIEW_CHARS = 3500;
