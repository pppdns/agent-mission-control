import type { ModelMessage } from "ai";
import { z } from "zod";
import type { BudgetTracker } from "./budget";
import type { CompactionStrategy, EventBus } from "./events";
import { clip } from "./evidence";
import type { LlmClient } from "./models";
import type { AgentInfo, ContextBudget, ContextCategory } from "./types";

export type Breakdown = Record<ContextCategory, number>;

/**
 * The working context of an agent tool loop, kept in parts so the harness can measure and compact each one.
 * The model sees `[user: working + retrieved + notes, ...turns]`.
 */
export interface LoopContext {
  system: string;
  working: string;
  retrieved: string;
  /** Working notes produced by compaction, folded into the first user message. */
  notes: string | null;
  turns: ModelMessage[];
  /** How far `retrieved` has been pruned already (0 = untouched). */
  pruneLevel?: number;
}

/** Below this, older tool output is not worth an LLM summary. */
const MIN_SUMMARIZE_CHARS = 2500;

export interface PruneResult {
  text: string;
  removed: string[];
  summarized: string[];
  preserved: string[];
}

/** Rebuilds `retrieved` at a given aggressiveness (1 = mild, 2 = strong). */
export type Pruner = (level: 1 | 2) => PruneResult;

export function loopMessages(c: LoopContext): ModelMessage[] {
  const first = [c.working, c.retrieved, c.notes ? `WORKING NOTES (compacted from your earlier turns; the source ids remain citable):\n${c.notes}` : ""]
    .filter((part) => part.trim())
    .join("\n\n");
  return [{ role: "user", content: first }, ...c.turns];
}

const CHARS_PER_TOKEN = 4;

function messageChars(m: ModelMessage): number {
  return typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length;
}

/** Measures per-agent context composition and emits it, calibrating the estimate against provider-reported input tokens. */
export class ContextManager {
  private ratio = new Map<string, number>();
  private compactions = 0;

  constructor(private readonly bus: EventBus) {}

  private tokens(agentId: string, chars: number): number {
    return Math.ceil((chars / CHARS_PER_TOKEN) * (this.ratio.get(agentId) ?? 1));
  }

  private emit(agentId: string, purpose: string, tokens: Breakdown, budget: ContextBudget): number {
    const total = Object.values(tokens).reduce((a, b) => a + b, 0);
    this.bus.emit({ type: "context.updated", data: { purpose, tokens, total, budget } }, agentId);
    return total;
  }

  breakdownLoop(agentId: string, c: LoopContext): Breakdown {
    let turns = 0;
    let tools = 0;
    for (const m of c.turns) {
      if (m.role === "tool") tools += messageChars(m);
      else turns += messageChars(m);
    }
    return {
      system: this.tokens(agentId, c.system.length),
      workingState: this.tokens(agentId, c.working.length + (c.notes?.length ?? 0)),
      recentTurns: this.tokens(agentId, turns),
      toolResults: this.tokens(agentId, tools),
      retrieved: this.tokens(agentId, c.retrieved.length),
    };
  }

  measureLoop(agent: AgentInfo, purpose: string, c: LoopContext, budget: ContextBudget): number {
    return this.emit(agent.id, purpose, this.breakdownLoop(agent.id, c), budget);
  }

  breakdownSingle(agentId: string, parts: { system: string; working: string; retrieved: string }): Breakdown {
    return {
      system: this.tokens(agentId, parts.system.length),
      workingState: this.tokens(agentId, parts.working.length),
      recentTurns: 0,
      toolResults: 0,
      retrieved: this.tokens(agentId, parts.retrieved.length),
    };
  }

  measureSingle(agent: AgentInfo, purpose: string, parts: { system: string; working: string; retrieved: string }, budget: ContextBudget): number {
    return this.emit(agent.id, purpose, this.breakdownSingle(agent.id, parts), budget);
  }

  /** Learns how far the chars/4 estimate is from the real tokenizer (tool schemas included) for this agent. */
  calibrate(agentId: string, estimated: number, measured: number) {
    if (estimated <= 0 || measured <= 0) return;
    const current = this.ratio.get(agentId) ?? 1;
    const observed = (measured / estimated) * current;
    this.ratio.set(agentId, Math.min(2, Math.max(0.5, (current + observed) / 2)));
  }

  nextCompactionId(): string {
    return `cmp${++this.compactions}`;
  }

  snapshot() {
    return { ratio: Object.fromEntries(this.ratio), compactions: this.compactions };
  }

  restore(state: { ratio: Record<string, number>; compactions: number }) {
    this.ratio = new Map(Object.entries(state.ratio));
    this.compactions = state.compactions;
  }
}

const compactionOutput = z.object({
  notes: z
    .array(z.object({ text: z.string().describe("One dense, specific fact or result"), sourceIds: z.array(z.string()) }))
    .describe("6-12 notes that keep every fact the agent still needs, with the source ids that back them"),
  openThreads: z.array(z.string()).describe("What the agent was still trying to find out"),
});

interface TurnDigest {
  calls: string[];
  resultChars: number;
  resultCount: number;
  sourceIds: string[];
  text: string;
}

function digestTurns(turns: ModelMessage[]): TurnDigest {
  const calls: string[] = [];
  const sourceIds = new Set<string>();
  const lines: string[] = [];
  let resultChars = 0;
  let resultCount = 0;
  for (const m of turns) {
    if (typeof m.content === "string") {
      lines.push(`${m.role}: ${m.content}`);
      continue;
    }
    for (const part of m.content) {
      if (part.type === "tool-call") {
        const input = part.input as { query?: string; url?: string } | null;
        const label = `${part.toolName}${input?.query ? ` "${input.query}"` : input?.url ? ` ${input.url}` : ""}`;
        calls.push(label);
        lines.push(`call: ${label}`);
      } else if (part.type === "tool-result") {
        const value = (part.output as { value?: unknown }).value;
        const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
        resultChars += text.length;
        resultCount += 1;
        for (const match of text.matchAll(/\[(s\d+)\]/g)) sourceIds.add(match[1]);
        lines.push(`result (${part.toolName}):\n${text}`);
      } else if (part.type === "text" && part.text.trim()) {
        lines.push(`${m.role}: ${part.text}`);
      }
    }
  }
  return { calls, resultChars, resultCount, sourceIds: [...sourceIds], text: lines.join("\n") };
}

/** Deterministic fallback: keep one line per source the agent saw. */
function truncateNotes(text: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const match of text.matchAll(/\[(s\d+)\] ([^\n]+)/g)) {
    if (seen.has(match[1])) continue;
    seen.add(match[1]);
    lines.push(`- [${match[1]}] ${clip(match[2], 140)}`);
  }
  return lines.join("\n") || "- (earlier turns produced no citable sources)";
}

/** Shrinks an agent's working context when it crosses the compaction threshold, and makes every step inspectable. */
export class Compactor {
  constructor(
    private readonly bus: EventBus,
    private readonly llm: LlmClient,
    private readonly budget: BudgetTracker,
    private readonly contexts: ContextManager,
  ) {}

  private total(b: Breakdown) {
    return Object.values(b).reduce((a, x) => a + x, 0);
  }

  /**
   * Compacts a tool loop in place. Pruning handed-in material is free, so it goes first; older tool turns are
   * summarized only if the context is still over the threshold. Returns false when there was nothing safe to compact.
   */
  async compactLoop(agent: AgentInfo, c: LoopContext, budget: ContextBudget, prune?: Pruner): Promise<boolean> {
    let compacted = false;
    if (prune && c.retrieved && (c.pruneLevel ?? 0) < 2) {
      compacted = this.pruneInto(agent, budget, this.total(this.contexts.breakdownLoop(agent.id, c)), c, prune);
      if (this.total(this.contexts.breakdownLoop(agent.id, c)) <= budget.compactAtTokens) return true;
    }
    return (await this.summarizeTurns(agent, c, budget)) || compacted;
  }

  private async summarizeTurns(agent: AgentInfo, c: LoopContext, budget: ContextBudget): Promise<boolean> {
    const before = this.total(this.contexts.breakdownLoop(agent.id, c));
    // Keep the latest assistant turn and its tool results together so every tool result still has its call.
    let lastAssistant = -1;
    for (let i = c.turns.length - 1; i >= 0; i--) {
      if (c.turns[i].role === "assistant") {
        lastAssistant = i;
        break;
      }
    }
    const older = lastAssistant > 0 ? c.turns.slice(0, lastAssistant) : [];
    const digest = digestTurns(older);
    if (digest.resultCount === 0 || digest.resultChars < MIN_SUMMARIZE_CHARS) return false;

    const id = this.contexts.nextCompactionId();
    const reason = `Context reached ${before.toLocaleString("en-US")} tokens, over the ${budget.compactAtTokens.toLocaleString("en-US")}-token compaction threshold.`;
    this.bus.emit({ type: "context.threshold_reached", data: { total: before, threshold: budget.compactAtTokens } }, agent.id);

    let notes: string;
    let strategy: CompactionStrategy = "summarize";
    let llmCallId: string | null = null;
    if (this.budget.workerCallsLeft() > 0) {
      this.bus.emit({ type: "context.compacting", data: { compactionId: id, strategy, reason } }, agent.id);
      try {
        const result = await this.llm.call({
          agentId: agent.id,
          kind: "compaction",
          purpose: "compact context",
          system:
            "You compress an AI research agent's earlier tool turns into working notes. Keep every concrete fact, number, date and name the agent may still cite, each with the source ids (like s3) that back it. Drop boilerplate, navigation text and duplicates. Never invent facts or source ids.",
          messages: [
            {
              role: "user",
              content: `Agent: ${agent.name}. Goal: ${agent.goal}\n\n${c.notes ? `Existing working notes:\n${c.notes}\n\n` : ""}Earlier turns to compress:\n${clip(digest.text, 24_000)}`,
            },
          ],
          schema: compactionOutput,
          maxOutputTokens: 1500,
          timeoutMs: 45_000,
        });
        llmCallId = result.callId;
        const out = result.structured as z.infer<typeof compactionOutput>;
        const lines = out.notes.map((n) => `- ${n.text}${n.sourceIds.length ? ` [${n.sourceIds.join(", ")}]` : ""}`);
        if (out.openThreads.length) lines.push(`Open threads: ${out.openThreads.join("; ")}`);
        notes = lines.join("\n");
      } catch {
        strategy = "truncate";
        notes = [c.notes ?? "", truncateNotes(digest.text)].filter(Boolean).join("\n");
      }
    } else {
      strategy = "truncate";
      this.bus.emit({ type: "context.compacting", data: { compactionId: id, strategy, reason: `${reason} No LLM budget left for a summary.` } }, agent.id);
      notes = [c.notes ?? "", truncateNotes(digest.text)].filter(Boolean).join("\n");
    }

    c.notes = notes;
    c.turns = c.turns.slice(lastAssistant);
    const after = this.total(this.contexts.breakdownLoop(agent.id, c));
    this.bus.emit(
      {
        type: "context.compacted",
        data: {
          compactionId: id,
          strategy,
          reason,
          beforeTokens: before,
          afterTokens: after,
          removed: [
            `${digest.resultCount} raw tool result${digest.resultCount === 1 ? "" : "s"} (${digest.resultChars.toLocaleString("en-US")} chars)`,
            `${older.filter((m) => m.role === "assistant").length} earlier assistant turn(s)`,
          ],
          summarized: digest.calls.length ? digest.calls : ["earlier conversation turns"],
          preserved: [
            "System prompt and tool definitions",
            "Mission, goal, teammates and inbox",
            "Latest turn with its tool results",
            digest.sourceIds.length ? `Citable source ids: ${digest.sourceIds.join(", ")}` : "No source ids were in the compacted turns",
          ],
          compactedState: notes,
          llmCallId,
        },
      },
      agent.id,
    );
    return true;
  }

  /** Fits a prompt's retrieved material (brief, sources) under the threshold. Returns the text to use. */
  fitRetrieved(
    agent: AgentInfo,
    budget: ContextBudget,
    parts: { system: string; working: string; retrieved: string },
    prune: Pruner,
  ): string {
    const before = this.total(this.contexts.breakdownSingle(agent.id, parts));
    if (before <= budget.compactAtTokens) return parts.retrieved;
    const c: LoopContext = { system: parts.system, working: parts.working, retrieved: parts.retrieved, notes: null, turns: [] };
    this.pruneInto(agent, budget, before, c, prune);
    return c.retrieved;
  }

  /** Prunes `retrieved` one level, and a second level if that is not enough. */
  private pruneInto(agent: AgentInfo, budget: ContextBudget, before: number, c: LoopContext, prune: Pruner): boolean {
    const start = (c.pruneLevel ?? 0) + 1;
    if (start > 2) return false;
    const id = this.contexts.nextCompactionId();
    const reason = `Context reached ${before.toLocaleString("en-US")} tokens, over the ${budget.compactAtTokens.toLocaleString("en-US")}-token compaction threshold.`;
    this.bus.emit({ type: "context.threshold_reached", data: { total: before, threshold: budget.compactAtTokens } }, agent.id);
    this.bus.emit({ type: "context.compacting", data: { compactionId: id, strategy: "prune", reason } }, agent.id);
    let level = start as 1 | 2;
    let result = prune(level);
    c.retrieved = result.text;
    let after = this.total(this.contexts.breakdownLoop(agent.id, c));
    if (after > budget.compactAtTokens && level === 1) {
      level = 2;
      result = prune(level);
      c.retrieved = result.text;
      after = this.total(this.contexts.breakdownLoop(agent.id, c));
    }
    c.pruneLevel = level;
    this.bus.emit(
      {
        type: "context.compacted",
        data: {
          compactionId: id,
          strategy: "prune",
          reason,
          beforeTokens: before,
          afterTokens: after,
          removed: result.removed,
          summarized: result.summarized,
          preserved: result.preserved,
          compactedState: clip(result.text, 3000),
          llmCallId: null,
        },
      },
      agent.id,
    );
    return true;
  }
}
