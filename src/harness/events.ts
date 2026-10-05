import type {
  AgentInfo,
  AgentMessage,
  AgentStatus,
  Artifact,
  ArtifactSection,
  BudgetExtension,
  BudgetSnapshot,
  ContextBudget,
  ContextCategory,
  Gap,
  HitlOption,
  Limits,
  Provider,
  RouteName,
  RuleName,
  Source,
  StepReport,
  TaskClass,
  Totals,
} from "./types";

export interface ToolManifestEntry {
  name: string;
  server: string | null;
  mcpTool: string | null;
  description: string;
  inputSchema: unknown;
  budget: "search" | "fetch" | null;
}

export type CompactionStrategy = "summarize" | "prune" | "truncate";

export interface EvaluationData {
  round: number;
  score: number;
  rubric: { coverage: number; support: number; balance: number };
  enoughEvidence: boolean;
  gaps: Gap[];
  unsupportedBlockIds: string[];
  conflict: string | null;
  decision: "synthesize" | "loop" | "ask_human";
  reason: string;
}

export type EventBody =
  | { type: "run.created"; data: { prompt: string } }
  | { type: "run.started"; data: { limits: Limits; tools: ToolManifestEntry[] } }
  | {
      type: "run.classified";
      data: {
        taskClass: TaskClass | "out_of_scope";
        objective: string;
        briefTitle: string;
        reframedPrompt: string | null;
        declineReason: string | null;
        rationale: string;
        keyQuestions: string[];
      };
    }
  | { type: "run.completed"; data: { totals: Totals; durationMs: number } }
  | { type: "run.failed"; data: { error: string; totals: Totals; durationMs: number } }
  | {
      type: "run.resumed";
      data: {
        checkpointId: string | null;
        phase: string;
        round: number;
        reason: string;
        artifact: Artifact | null;
        agentStatus: Record<string, AgentStatus>;
        sourceIds: string[];
        messageIds: string[];
      };
    }
  | { type: "budget.exhausted"; data: { reason: string } }
  | { type: "budget.updated"; data: { snapshot: BudgetSnapshot } }
  | { type: "budget.extended"; data: { extension: BudgetExtension; reason: string } }
  | {
      type: "routing.decided";
      data: {
        callId: string | null;
        rule?: RuleName;
        route: RouteName;
        provider: Provider;
        model: string;
        reason: string;
        strategy?: "auto";
        purpose?: string;
      };
    }
  | { type: "agent.spawned"; data: { agent: AgentInfo } }
  | { type: "agent.started"; data: { goal: string; round?: number } }
  | { type: "agent.retasked"; data: { goal: string; angle: string | null; round: number } }
  | { type: "agent.note"; data: { text: string } }
  | { type: "agent.message_sent"; data: { message: AgentMessage } }
  | { type: "agent.retrying"; data: { reason: string; attempt: number; fallbackModel: string | null } }
  | { type: "agent.completed"; data: { report: StepReport | null; summary: string } }
  | { type: "agent.failed"; data: { error: string } }
  | {
      type: "llm.requested";
      data: {
        callId: string;
        purpose: string;
        provider: Provider;
        model: string;
        route: RouteName;
        rule?: RuleName;
        messageCount: number;
        promptChars: number;
        step: number | null;
      };
    }
  | {
      type: "llm.completed";
      data: {
        callId: string;
        provider: Provider;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        latencyMs: number;
        costUsd: number;
        finishReason: string;
        text: string;
        toolCalls: { id: string; name: string; input: unknown }[];
        structured: unknown | null;
      };
    }
  | { type: "llm.streaming"; data: { callId: string; outputChars: number; elapsedMs: number } }
  | { type: "llm.failed"; data: { callId: string; provider: Provider; model: string; error: string; latencyMs: number } }
  | {
      type: "tool.requested";
      data: {
        toolCallId: string;
        tool: string;
        server: string | null;
        mcpTool: string | null;
        params: unknown;
        llmCallId: string | null;
      };
    }
  | {
      type: "tool.completed";
      data: {
        toolCallId: string;
        tool: string;
        durationMs: number;
        resultPreview: string;
        resultChars: number;
        sourceIds: string[];
      };
    }
  | {
      type: "tool.failed";
      data: {
        toolCallId: string;
        tool: string;
        durationMs: number;
        error: string;
        attempt: number;
        willRetry: boolean;
      };
    }
  | { type: "source.added"; data: { source: Omit<Source, "content"> } }
  | { type: "artifact.created"; data: { artifact: Artifact } }
  | {
      type: "artifact.updated";
      data: {
        version: number;
        change: "append" | "rewrite" | "annotate" | "title";
        summary: string;
        title: string | null;
        section: ArtifactSection | null;
      };
    }
  | {
      type: "context.updated";
      data: {
        purpose: string;
        tokens: Record<ContextCategory, number>;
        total: number;
        budget: ContextBudget;
      };
    }
  | { type: "context.threshold_reached"; data: { total: number; threshold: number } }
  | { type: "context.compacting"; data: { compactionId: string; strategy: CompactionStrategy; reason: string } }
  | {
      type: "context.compacted";
      data: {
        compactionId: string;
        strategy: CompactionStrategy;
        reason: string;
        beforeTokens: number;
        afterTokens: number;
        removed: string[];
        summarized: string[];
        preserved: string[];
        compactedState: string;
        llmCallId: string | null;
      };
    }
  | { type: "evaluation.completed"; data: EvaluationData }
  | { type: "loop.started"; data: { round: number; reason: string; gaps: Gap[]; assignments: { agentId: string; goal: string }[] } }
  | {
      type: "hitl.requested";
      data: {
        requestId: string;
        reason: "conflict" | "budget";
        question: string;
        context: string;
        options: HitlOption[];
        recommended: string;
        timeoutMs: number;
        deadlineTs: number;
      };
    }
  | { type: "hitl.resolved"; data: { requestId: string; optionId: string; resolvedBy: "visitor" | "timeout"; waitedMs: number } }
  | { type: "checkpoint.created"; data: { checkpointId: string; phase: string; round: number; label: string } };

export type EventType = EventBody["type"];

export type RunEvent = EventBody & {
  runId: string;
  seq: number;
  ts: number;
  agentId: string | null;
};

export interface EventSink {
  append(runId: string, events: RunEvent[]): Promise<void>;
}

const FLUSH_INTERVAL_MS = 250;

export class EventBus {
  private seq: number;
  private buffer: RunEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<(event: RunEvent) => void>();
  private writeError: unknown = null;

  constructor(
    readonly runId: string,
    private readonly sink: EventSink,
    /** Last persisted seq; a resumed run continues the log after it. */
    startSeq = 0,
  ) {
    this.seq = startSeq;
  }

  emit<T extends EventBody>(body: T, agentId: string | null = null): RunEvent {
    const event = {
      ...body,
      runId: this.runId,
      seq: ++this.seq,
      ts: Date.now(),
      agentId,
    } as RunEvent;
    this.buffer.push(event);
    for (const listener of this.listeners) listener(event);
    this.schedule();
    return event;
  }

  subscribe(listener: (event: RunEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get lastSeq(): number {
    return this.seq;
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const batch = this.buffer;
    this.buffer = [];
    if (batch.length > 0) {
      this.chain = this.chain.then(() => this.write(batch));
    }
    await this.chain;
    if (this.writeError) {
      const error = this.writeError;
      this.writeError = null;
      throw error;
    }
  }

  private schedule() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush().catch(() => undefined);
    }, FLUSH_INTERVAL_MS);
  }

  private async write(batch: RunEvent[]) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.sink.append(this.runId, batch);
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
    this.writeError = lastError;
  }
}
