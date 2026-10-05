export type TaskClass = "research" | "comparison" | "decision";

export type AgentRole =
  | "orchestrator"
  | "researcher"
  | "skeptic"
  | "evidence_verifier"
  | "editor";

export type Provider = "openai" | "anthropic";

export type RouteName = "complex" | "simple" | "critique";

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
  routeReason: string;
  provider: Provider;
  model: string;
  tools: string[];
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

export type RunStatus = "queued" | "running" | "completed" | "failed";
