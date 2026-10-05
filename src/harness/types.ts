export type TaskClass = "research" | "comparison" | "decision";

export type AgentRole =
  | "orchestrator"
  | "researcher"
  | "skeptic"
  | "evidence_verifier"
  | "evaluator"
  | "editor";

export type Provider = "openai" | "anthropic";

export type RouteName = "complex" | "simple" | "critique";

export type RuleName =
  | "complex_planning"
  | "simple_parallel_research"
  | "critique_cross_family"
  | "complex_gap_detection"
  | "complex_synthesis"
  | "simple_compaction"
  | "escalate_large_context"
  | "fallback_provider_error";

/** What an LLM call is for; the router maps it to a rule. */
export type CallKind = "plan" | "research" | "critique" | "verify" | "evaluate" | "synthesis" | "compaction";

export type MessageType =
  | "finding"
  | "claim"
  | "evidence"
  | "objection"
  | "question"
  | "request"
  | "delegation"
  | "review"
  | "revision"
  | "decision";

export const MESSAGE_TYPES: MessageType[] = [
  "finding",
  "claim",
  "evidence",
  "objection",
  "question",
  "request",
  "delegation",
  "review",
  "revision",
  "decision",
];

export type AgentStatus =
  | "spawned"
  | "running"
  | "completed"
  | "failed";

export interface AgentInfo {
  id: string;
  role: AgentRole;
  name: string;
  goal: string;
  angle: string | null;
  parentId: string | null;
  route: RouteName;
  /** Missing on runs recorded before per-call routing existed. */
  rule?: RuleName;
  routeReason: string;
  provider: Provider;
  model: string;
  tools: string[];
  /** Research round the agent was spawned in (1 = initial team). */
  round?: number;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  refs: string[];
}

export interface StepReport {
  objective: string;
  plan: string[];
  rationale: string;
  decisions: string[];
  observations: string[];
  critiques: string[];
  evidence: string[];
  nextAction: string;
}

export interface Source {
  id: string;
  url: string;
  title: string;
  snippet: string;
  content: string;
  via: "web_search" | "fetch_page";
  agentId: string;
  query: string | null;
}

export type SectionId =
  | "executive_summary"
  | "key_findings"
  | "evidence"
  | "arguments"
  | "counterarguments"
  | "risks"
  | "open_questions"
  | "recommendation";

export const SECTION_TITLES: Record<SectionId, string> = {
  executive_summary: "Executive summary",
  key_findings: "Key findings",
  evidence: "Evidence",
  arguments: "Arguments",
  counterarguments: "Counterarguments",
  risks: "Risks",
  open_questions: "Open questions",
  recommendation: "Recommendation",
};

export const SECTION_ORDER: SectionId[] = [
  "executive_summary",
  "key_findings",
  "evidence",
  "arguments",
  "counterarguments",
  "risks",
  "open_questions",
  "recommendation",
];

export type BlockKind = "text" | "claim" | "bullet";
export type Confidence = "high" | "medium" | "low";
export type Verdict = "unchecked" | "supported" | "weak" | "unsupported";

export interface BlockComment {
  id: string;
  author: string;
  kind: "objection" | "verification" | "note";
  severity: "minor" | "major" | null;
  text: string;
}

export interface ArtifactBlock {
  id: string;
  kind: BlockKind;
  text: string;
  sourceIds: string[];
  confidence: Confidence | null;
  verdict: Verdict;
  author: string;
  comments: BlockComment[];
}

export type SectionStatus = "empty" | "drafting" | "reviewing" | "final";

export interface ArtifactSection {
  id: SectionId;
  title: string;
  status: SectionStatus;
  blocks: ArtifactBlock[];
  updatedBy: string | null;
  updatedAtVersion: number;
}

export interface Artifact {
  version: number;
  title: string;
  sections: ArtifactSection[];
}

export interface Limits {
  maxInputChars: number;
  maxAgents: number;
  maxLlmCalls: number;
  maxWebSearches: number;
  maxPageFetches: number;
  maxRunMs: number;
  maxCostUsd: number;
  workerStepLimit: number;
  editorReserveCalls: number;
  /** Follow-up research rounds after the initial one. */
  maxResearchLoops: number;
  /** Web searches held back from the initial round for follow-up loops. */
  loopSearchReserve: number;
  maxHitlRequests: number;
  hitlTimeoutMs: number;
  /** Extra active time the final synthesis may use past maxRunMs before the hard stop. */
  synthesisGraceMs: number;
}

export interface BudgetExtension {
  searches: number;
  fetches: number;
  llmCalls: number;
  costUsd: number;
  runMs: number;
}

export interface BudgetSnapshot {
  searches: { used: number; limit: number };
  fetches: { used: number; limit: number };
  llmCalls: { used: number; limit: number };
  costUsd: { used: number; limit: number };
  activeMs: number;
  maxRunMs: number;
  allowances: Record<string, { allowance: number; used: number }>;
  loopReserve: number;
  extended: boolean;
  exhausted: string | null;
}

export type ContextCategory = "system" | "workingState" | "recentTurns" | "toolResults" | "retrieved";

export const CONTEXT_CATEGORIES: ContextCategory[] = ["system", "workingState", "recentTurns", "toolResults", "retrieved"];

export interface ContextBudget {
  windowTokens: number;
  compactAtTokens: number;
  reservedOutputTokens: number;
}

export interface HitlOption {
  id: string;
  label: string;
  description: string;
  action: "research_more" | "investigate" | "extend_budget" | "continue";
  /** For "investigate": the index of the gap to follow up. */
  gapIndex: number | null;
}

export interface HitlRequest {
  id: string;
  reason: "conflict" | "budget";
  question: string;
  context: string;
  options: HitlOption[];
  recommended: string;
  timeoutMs: number;
}

export interface Gap {
  question: string;
  angle: string;
  why: string;
}

export interface Totals {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  llmCalls: number;
  searches: number;
  fetches: number;
  agents: number;
}

export const EMPTY_TOTALS: Totals = {
  inputTokens: 0,
  outputTokens: 0,
  cachedTokens: 0,
  costUsd: 0,
  llmCalls: 0,
  searches: 0,
  fetches: 0,
  agents: 0,
};

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed";
