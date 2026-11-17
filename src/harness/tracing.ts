/**
 * OpenTelemetry spans for the harness, vendor-neutral: only `@opentelemetry/api` and the AI SDK's OTel integration.
 * Without a registered tracer provider every call here is a no-op, so the harness still runs anywhere.
 * Where a provider is registered (Trigger.dev worker, local scripts, evals), the trace nests as
 * mission → phase → agent → LLM call / tool call. Attribute names follow Langfuse's OTel conventions
 * (`langfuse.*`), which other backends simply keep as plain attributes.
 */
import { OpenTelemetry } from "@ai-sdk/otel";
import { SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { registerTelemetry } from "ai";
import type { AgentInfo } from "./types";

const TRACER = "agent-mission-control";
const MAX_ATTR_CHARS = 20_000;

let aiTelemetryRegistered = false;

/** Lets every AI SDK call emit GenAI spans (model, tokens, messages) into whatever tracer provider is active. */
export function registerAiTelemetry() {
  if (aiTelemetryRegistered) return;
  aiTelemetryRegistered = true;
  registerTelemetry(
    new OpenTelemetry({
      usage: true,
      // Routing metadata travels on the call's runtime context and lands on the AI SDK's own spans.
      enrichSpan: ({ spanType, runtimeContext }) => {
        if (spanType !== "operation" || !runtimeContext) return undefined;
        const attrs: Attributes = {};
        for (const [key, value] of Object.entries(runtimeContext)) {
          if (typeof value === "string" || typeof value === "number") attrs[`langfuse.observation.metadata.${key}`] = value;
        }
        return attrs;
      },
    }),
  );
}

export type ObservationType = "span" | "agent" | "tool" | "chain" | "evaluator" | "guardrail";

export function json(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_ATTR_CHARS ? `${text.slice(0, MAX_ATTR_CHARS)}… [truncated]` : text;
}

/** Runs `fn` inside an active span; errors are recorded and rethrown. */
export function withSpan<T>(
  name: string,
  options: { type?: ObservationType; attributes?: Attributes; input?: unknown },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const attributes: Attributes = { ...options.attributes };
  if (options.type) attributes["langfuse.observation.type"] = options.type;
  if (options.input !== undefined) attributes["langfuse.observation.input"] = json(options.input);
  return trace.getTracer(TRACER).startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await fn(span);
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function setOutput(span: Span, output: unknown) {
  span.setAttribute("langfuse.observation.output", json(output));
}

/** Attributes that make the root span a Langfuse trace: one trace per run, grouped into a session by run ID. */
export function missionAttributes(runId: string, prompt: string, tags: string[]): Attributes {
  return {
    "langfuse.trace.name": "mission",
    "langfuse.session.id": runId,
    "langfuse.trace.input": json(prompt),
    "langfuse.trace.tags": tags,
    "langfuse.trace.metadata.run_id": runId,
    "run.id": runId,
  };
}

/** One span per agent turn; LLM and tool spans made inside it nest under it. */
export function withAgentSpan<T>(agent: AgentInfo, fn: (span: Span) => Promise<T>): Promise<T> {
  return withSpan(
    `agent:${agent.name}`,
    {
      type: agent.role === "evaluator" ? "evaluator" : "agent",
      input: { goal: agent.goal, angle: agent.angle, round: agent.round },
      attributes: {
        "agent.id": agent.id,
        "agent.role": agent.role,
        "agent.model": agent.model,
        "agent.route": agent.route,
        "langfuse.observation.metadata.role": agent.role,
        "langfuse.observation.metadata.route": agent.route,
      },
    },
    fn,
  );
}
