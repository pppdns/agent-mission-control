import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, streamText, tool, type LanguageModel, type ModelMessage } from "ai";
import type { ZodType } from "zod";
import type { BudgetTracker } from "./budget";
import { MODELS, EVENT_PREVIEW_CHARS, type ModelSpec } from "./config";
import type { EventBus } from "./events";
import type { ModelRouter, RouteDecision } from "./router";
import type { CallKind } from "./types";

export interface ApiKeys {
  openai?: string;
  anthropic?: string;
}

export interface ToolSpec {
  description: string;
  inputSchema: ZodType;
}

export interface CallRequest {
  agentId: string;
  /** What the call is for; the router picks the model from it. */
  kind: CallKind;
  /** Human-readable label shown in the trace. */
  purpose: string;
  /** Estimated prompt size, used by the router's large-context rule. */
  estimatedInputTokens?: number;
  step?: number;
  system: string;
  messages: ModelMessage[];
  tools?: Record<string, ToolSpec>;
  toolChoice?: "auto" | "required" | { type: "tool"; toolName: string };
  /** Structured output schema (mutually exclusive with tools). */
  schema?: ZodType;
  /** When set together with `schema`, the call streams and reports partial objects. */
  onPartial?: (partial: unknown) => void;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export interface CallResult {
  callId: string;
  model: string;
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  structured: unknown | null;
  responseMessages: ModelMessage[];
  inputTokens: number;
}

export class BudgetStop extends Error {
  constructor(reason: string) {
    super(`Budget stop: ${reason}`);
    this.name = "BudgetStop";
  }
}

const STREAM_EMIT_INTERVAL_MS = 1500;

export function computeCost(
  spec: ModelSpec,
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number; cacheWriteTokens?: number },
): number {
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - (usage.cacheWriteTokens ?? 0));
  return (
    (uncached * spec.inputPerM +
      usage.cachedTokens * spec.cachedInputPerM +
      (usage.cacheWriteTokens ?? 0) * spec.cacheWritePerM +
      usage.outputTokens * spec.outputPerM) /
    1_000_000
  );
}

function capJson(value: unknown, max = EVENT_PREVIEW_CHARS): unknown {
  if (value === null || value === undefined) return null;
  const text = JSON.stringify(value);
  if (text.length <= max) return value;
  return `${text.slice(0, max)}… [truncated ${text.length - max} chars]`;
}

/** Provider-agnostic LLM access: routing, fallback, usage + cost accounting, and event emission. */
export class LlmClient {
  private readonly openai;
  private readonly anthropic;
  private counter = 0;
  /** Distinguishes call ids made after a resume from ids of calls interrupted by the crash. */
  private prefix = "";

  constructor(
    keys: ApiKeys,
    private readonly bus: EventBus,
    private readonly budget: BudgetTracker,
    private readonly router: ModelRouter,
  ) {
    this.openai = createOpenAI({ apiKey: keys.openai });
    this.anthropic = createAnthropic({ apiKey: keys.anthropic });
  }

  snapshot() {
    return { counter: this.counter };
  }

  restore(state: { counter: number }, epoch: string) {
    this.counter = state.counter;
    this.prefix = epoch;
  }

  private model(spec: ModelSpec): LanguageModel {
    return spec.provider === "openai" ? this.openai(spec.id) : this.anthropic(spec.id);
  }

  async call(req: CallRequest): Promise<CallResult> {
    const primary = this.router.decide({ kind: req.kind, estimatedInputTokens: req.estimatedInputTokens });
    const decisions: RouteDecision[] = [primary, this.router.fallback(primary)];
    let lastError: unknown;

    for (let i = 0; i < decisions.length; i++) {
      const stopReason = this.budget.hardLimitReason();
      if (stopReason) throw new BudgetStop(stopReason);

      const decision = decisions[i];
      const spec = MODELS[decision.model];
      const callId = `${this.prefix}llm${++this.counter}`;
      const promptChars = req.system.length + JSON.stringify(req.messages).length;
      this.bus.emit(
        {
          type: "routing.decided",
          data: {
            callId,
            rule: decision.rule,
            route: decision.route,
            provider: decision.provider,
            model: decision.model,
            reason: decision.reason,
            strategy: decision.strategy,
            purpose: req.purpose,
          },
        },
        req.agentId,
      );
      this.bus.emit(
        {
          type: "llm.requested",
          data: {
            callId,
            purpose: req.purpose,
            provider: spec.provider,
            model: spec.id,
            route: decision.route,
            rule: decision.rule,
            messageCount: req.messages.length,
            promptChars,
            step: req.step ?? null,
          },
        },
        req.agentId,
      );

      const startedAt = Date.now();
      let lastStreamEmit = startedAt;
      const progress = (outputChars: number) => {
        const now = Date.now();
        if (now - lastStreamEmit < STREAM_EMIT_INTERVAL_MS) return;
        lastStreamEmit = now;
        this.bus.emit({ type: "llm.streaming", data: { callId, outputChars, elapsedMs: now - startedAt } }, req.agentId);
      };
      try {
        const result = await this.execute(spec, req, progress);
        const latencyMs = Date.now() - startedAt;
        const costUsd = computeCost(spec, result.usage);
        this.budget.recordLlm({ ...result.usage, costUsd });
        this.bus.emit(
          {
            type: "llm.completed",
            data: {
              callId,
              provider: spec.provider,
              model: spec.id,
              inputTokens: result.usage.inputTokens,
              outputTokens: result.usage.outputTokens,
              cachedTokens: result.usage.cachedTokens,
              latencyMs,
              costUsd,
              finishReason: result.finishReason,
              text: result.text.slice(0, EVENT_PREVIEW_CHARS),
              toolCalls: result.toolCalls.map((c) => ({ id: c.id, name: c.name, input: capJson(c.input, 1500) })),
              structured: capJson(result.structured),
            },
          },
          req.agentId,
        );
        return {
          callId,
          model: spec.id,
          text: result.text,
          toolCalls: result.toolCalls,
          structured: result.structured,
          responseMessages: result.responseMessages,
          inputTokens: result.usage.inputTokens,
        };
      } catch (error) {
        if (error instanceof BudgetStop) throw error;
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        this.bus.emit(
          {
            type: "llm.failed",
            data: { callId, provider: spec.provider, model: spec.id, error: message.slice(0, 600), latencyMs: Date.now() - startedAt },
          },
          req.agentId,
        );
        if (i + 1 < decisions.length) {
          this.bus.emit(
            {
              type: "agent.retrying",
              data: { reason: `${spec.id} failed: ${message.slice(0, 160)}`, attempt: i + 1, fallbackModel: decisions[i + 1].model },
            },
            req.agentId,
          );
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async execute(spec: ModelSpec, req: CallRequest, progress: (outputChars: number) => void) {
    const base = {
      model: this.model(spec),
      system: req.system,
      messages: req.messages,
      maxOutputTokens: req.maxOutputTokens ?? 6000,
      abortSignal: AbortSignal.timeout(req.timeoutMs ?? 90_000),
      maxRetries: 1,
      ...(spec.reasoning ? { reasoning: spec.reasoning } : {}),
    };

    if (req.schema) {
      const output = Output.object({ schema: req.schema });
      if (req.onPartial) {
        let streamError: unknown;
        const stream = streamText({ ...base, output, onError: ({ error }) => void (streamError = error) });
        for await (const partial of stream.partialOutputStream) {
          req.onPartial(partial);
          progress(JSON.stringify(partial).length);
        }
        if (streamError) throw streamError;
        const [usage, finishReason, structured] = await Promise.all([stream.totalUsage, stream.finishReason, stream.output]);
        return {
          text: "",
          toolCalls: [],
          structured: structured as unknown,
          finishReason: String(finishReason),
          usage: normalizeUsage(usage),
          responseMessages: [] as ModelMessage[],
        };
      }
      const result = await generateText({ ...base, output });
      return {
        text: result.text,
        toolCalls: [],
        structured: result.output as unknown,
        finishReason: String(result.finishReason),
        usage: normalizeUsage(result.usage),
        responseMessages: result.response.messages as ModelMessage[],
      };
    }

    const tools = req.tools
      ? Object.fromEntries(
          Object.entries(req.tools).map(([name, spec]) => [
            name,
            tool({ description: spec.description, inputSchema: spec.inputSchema }),
          ]),
        )
      : undefined;
    // Claude Sonnet 5.5 rejects forced tool use; with a single finish tool left, 'auto' behaves the same in practice.
    const toolChoice = spec.provider === "anthropic" ? undefined : req.toolChoice;
    let streamError: unknown;
    const stream = streamText({ ...base, tools, toolChoice, onError: ({ error }) => void (streamError = error) });
    let chars = 0;
    for await (const part of stream.fullStream) {
      if (part.type === "text-delta" || part.type === "reasoning-delta") chars += part.text.length;
      else if (part.type === "tool-input-delta") chars += part.delta.length;
      else continue;
      progress(chars);
    }
    if (streamError) throw streamError;
    const [text, toolCalls, finishReason, usage, response] = await Promise.all([
      stream.text,
      stream.toolCalls,
      stream.finishReason,
      stream.totalUsage,
      stream.response,
    ]);
    return {
      text,
      toolCalls: toolCalls.map((c) => ({ id: c.toolCallId, name: c.toolName, input: c.input })),
      structured: null,
      finishReason: String(finishReason),
      usage: normalizeUsage(usage),
      responseMessages: response.messages as ModelMessage[],
    };
  }
}

function normalizeUsage(usage: {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  inputTokenDetails?: { cacheReadTokens?: number | undefined; cacheWriteTokens?: number | undefined };
}) {
  return {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
}
