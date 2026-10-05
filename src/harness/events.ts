import type {
  AgentInfo,
  AgentMessage,
  Artifact,
  ArtifactSection,
  Limits,
  Provider,
  RouteName,
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
  | { type: "budget.exhausted"; data: { reason: string } }
  | { type: "routing.decided"; data: { route: RouteName; provider: Provider; model: string; reason: string } }
  | { type: "agent.spawned"; data: { agent: AgentInfo } }
  | { type: "agent.started"; data: { goal: string } }
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
    };

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
  private seq = 0;
  private buffer: RunEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private chain: Promise<void> = Promise.resolve();
  private listeners = new Set<(event: RunEvent) => void>();
  private writeError: unknown = null;

  constructor(
    readonly runId: string,
    private readonly sink: EventSink,
  ) {}

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
