import type { ModelMessage } from "ai";
import type { ZodType } from "zod";
import type { RunContext } from "./context";
import { clip } from "./evidence";
import type { AgentInfo } from "./types";

export const FINISH_TOOL = "submit_report";

export interface LoopConfig<R> {
  system: string;
  user: string;
  reportSchema: ZodType<R>;
  reportDescription: string;
  maxSteps: number;
}

/**
 * The agent loop, owned by the harness (not delegated to an SDK):
 * call the model, execute any requested tools through the registry, feed results back, repeat
 * until the agent submits its structured report or a budget forces it to.
 */
export async function runAgentLoop<R>(ctx: RunContext, agent: AgentInfo, cfg: LoopConfig<R>): Promise<R> {
  const messages: ModelMessage[] = [{ role: "user", content: cfg.user }];
  const externalTools = agent.tools;

  for (let step = 1; step <= cfg.maxSteps; step++) {
    const mustFinish =
      step === cfg.maxSteps ||
      externalTools.length === 0 ||
      ctx.budget.exhausted ||
      ctx.budget.workerCallsLeft() <= 0;

    const tools = {
      ...(mustFinish ? {} : ctx.tools.specs(externalTools)),
      [FINISH_TOOL]: { description: cfg.reportDescription, inputSchema: cfg.reportSchema },
    };

    if (mustFinish && step > 1) {
      messages.push({
        role: "user",
        content: `Budget or step limit reached${ctx.budget.exhaustedBecause ? ` (${ctx.budget.exhaustedBecause})` : ""}. Submit your report now using what you have.`,
      });
    }

    const result = await ctx.llm.call({
      agentId: agent.id,
      purpose: mustFinish ? "final report" : `research step ${step}`,
      route: agent.route,
      step,
      system: cfg.system,
      messages,
      tools,
      toolChoice: mustFinish ? { type: "tool", toolName: FINISH_TOOL } : "required",
    });

    if (result.text.trim()) {
      ctx.bus.emit({ type: "agent.note", data: { text: clip(result.text, 600) } }, agent.id);
    }
    messages.push(...result.responseMessages);
    // The SDK answers tool calls whose input it rejected itself; a second result for the same id is an API error.
    const answered = answeredToolCalls(result.responseMessages);

    const finish = result.toolCalls.find((c) => c.name === FINISH_TOOL);
    if (finish) {
      const parsed = cfg.reportSchema.safeParse(finish.input);
      if (parsed.success) return parsed.data;
      const unanswered = result.toolCalls.filter((c) => !answered.has(c.id));
      if (unanswered.length > 0) {
        messages.push({
          role: "tool",
          content: unanswered.map((c) => ({
            type: "tool-result" as const,
            toolCallId: c.id,
            toolName: c.name,
            output: {
              type: "error-text" as const,
              value:
                c.id === finish.id
                  ? `Report did not match the schema: ${parsed.error.message.slice(0, 600)}`
                  : "Not executed: submit a valid report first.",
            },
          })),
        });
      }
      ctx.bus.emit(
        { type: "agent.retrying", data: { reason: "Report failed schema validation", attempt: step, fallbackModel: null } },
        agent.id,
      );
      continue;
    }

    const pending = result.toolCalls.filter((c) => !answered.has(c.id));
    if (result.toolCalls.length === 0) {
      messages.push({ role: "user", content: `Use a tool: either gather evidence or call ${FINISH_TOOL}.` });
      continue;
    }

    if (pending.length === 0) continue;

    const outcomes = await Promise.all(
      pending.map(async (call) => ({
        call,
        outcome: await ctx.tools.invoke({
          toolName: call.name,
          rawInput: call.input,
          toolCallId: call.id,
          llmCallId: result.callId,
          agentId: agent.id,
          allowed: externalTools,
        }),
      })),
    );

    messages.push({
      role: "tool",
      content: outcomes.map(({ call, outcome }) => ({
        type: "tool-result" as const,
        toolCallId: call.id,
        toolName: call.name,
        output: outcome.ok
          ? { type: "text" as const, value: outcome.content }
          : { type: "error-text" as const, value: outcome.content },
      })),
    });
  }

  throw new Error(`${agent.name} did not submit a valid report within ${cfg.maxSteps} steps`);
}

function answeredToolCalls(messages: ModelMessage[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type === "tool-result") ids.add(part.toolCallId);
    }
  }
  return ids;
}
