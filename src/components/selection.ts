export type Selection =
  | { type: "agent"; id: string }
  | { type: "pair"; a: string; b: string }
  | { type: "message"; id: string }
  | { type: "llm"; id: string }
  | { type: "tool"; id: string }
  | { type: "source"; id: string }
  | null;
