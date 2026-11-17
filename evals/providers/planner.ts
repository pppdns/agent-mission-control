/**
 * Promptfoo provider for the Orchestrator's planning step in isolation: the production system prompt, user message
 * and output schema, on a configurable model. `config.model` is "route" (whatever config.ts routes planning to) or
 * "<provider>:<model>" with provider openai, anthropic or gateway (Vercel AI Gateway, used for other model families).
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, generateText, Output, type LanguageModel } from "ai";
import { DEFAULT_LIMITS, MODELS, ROUTES, ROUTING_RULES } from "../../src/harness/config";
import { computeCost } from "../../src/harness/models";
import { PLAN_SYSTEM, planUserMessage } from "../../src/harness/runtime";
import { planOutput } from "../../src/harness/schemas";
import { registerAiTelemetry, withSpan } from "../../src/harness/tracing";
import { startTracing, flushTracing } from "../../src/observability/otel";

interface ProviderOptions {
  id?: string;
  label?: string;
  config?: { model?: string };
}

/** USD per million tokens for gateway models (not in config.ts, which only lists the models the app routes to). */
const GATEWAY_PRICES: Record<string, { inputPerM: number; outputPerM: number }> = {
  "google/gemini-3.8-flash": { inputPerM: 0.75, outputPerM: 3.75 },
  "google/gemini-4-argon": { inputPerM: 2, outputPerM: 10 },
};

export default class PlannerProvider {
  private readonly modelRef: string;
  private readonly label: string;

  constructor(options: ProviderOptions = {}) {
    const route = ROUTES[ROUTING_RULES.complex_planning.route!];
    const ref = options.config?.model ?? "route";
    this.modelRef = ref === "route" ? `${MODELS[route.model].provider}:${route.model}` : ref;
    this.label = options.label ?? `planner (${this.modelRef})`;
    startTracing();
    registerAiTelemetry();
  }

  id() {
    return this.label;
  }

  private model(): { model: LanguageModel; reasoning?: string } {
    const [provider, ...rest] = this.modelRef.split(":");
    const id = rest.join(":");
    if (provider === "gateway") return { model: gateway(id) };
    const spec = MODELS[id];
    const reasoning = spec?.reasoning ?? undefined;
    if (provider === "openai") return { model: createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(id), reasoning };
    if (provider === "anthropic") return { model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id), reasoning };
    throw new Error(`Unknown provider in model "${this.modelRef}"`);
  }

  async callApi(prompt: string) {
    const { model, reasoning } = this.model();
    const startedAt = Date.now();
    try {
      const result = await withSpan(
        "eval:planner",
        { type: "chain", input: prompt, attributes: { "langfuse.trace.name": "eval:planner", "langfuse.trace.tags": ["eval", "planner", this.modelRef] } },
        () =>
          generateText({
            model,
            system: PLAN_SYSTEM,
            messages: [{ role: "user", content: planUserMessage(prompt, DEFAULT_LIMITS) }],
            output: Output.object({ schema: planOutput }),
            maxOutputTokens: 3000,
            maxRetries: 2,
            telemetry: { functionId: "eval: plan the mission" },
            ...(reasoning ? { reasoning: reasoning as "low" } : {}),
          }),
      );
      await flushTracing();
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      return {
        output: result.output,
        tokenUsage: { prompt: inputTokens, completion: outputTokens, total: inputTokens + outputTokens },
        cost: this.cost(inputTokens, outputTokens, result.usage.inputTokenDetails?.cacheReadTokens ?? 0),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private cost(inputTokens: number, outputTokens: number, cachedTokens: number): number {
    const id = this.modelRef.split(":").slice(1).join(":");
    const spec = MODELS[id];
    if (spec) return computeCost(spec, { inputTokens, outputTokens, cachedTokens });
    const p = GATEWAY_PRICES[id];
    return p ? (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1_000_000 : 0;
  }
}
