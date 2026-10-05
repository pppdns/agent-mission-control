export type Selection =
  | { type: "agent"; id: string }
  | { type: "pair"; a: string; b: string }
  | { type: "message"; id: string }
  | { type: "llm"; id: string }
  | { type: "tool"; id: string }
  | { type: "source"; id: string }
  | { type: "compaction"; id: string }
  /** Evaluations are keyed by the seq of their event. */
  | { type: "evaluation"; id: string }
  | { type: "hitl"; id: string }
  | { type: "checkpoint"; id: string }
  | null;
