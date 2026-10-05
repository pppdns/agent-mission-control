import type { ModelMessage } from "ai";
import type { ZodType } from "zod";
import { CONTEXT_BUDGETS } from "./config";
import type { RunContext } from "./context";
import { loopMessages, type LoopContext, type Pruner } from "./context-window";
import { clip } from "./evidence";
import { ROLE_KIND } from "./router";
import type { AgentInfo, ContextBudget } from "./types";

export const FINISH_TOOL = "submit_report";

export interface LoopConfig<R> {
  system: string;
  /** Mission, goal, teammates and inbox: the agent's working state. */
  user: string;
  /** Material handed to the agent (draft brief, source excerpts) that may be pruned under context pressure. */
  retrieved?: string;
  prune?: Pruner;
  reportSchema: ZodType<R>;
  reportDescription: string;
  maxSteps: number;
  budget?: ContextBudget;
}

/**
 * The agent loop, owned by the harness (not delegated to an SDK):
 * call the model, execute any requested tools through the registry, feed results back, repeat
 * until the agent submits its structured report or a budget forces it to.
 * The working context is measured before every call and compacted when it crosses the threshold.
 */
export async function runAgentLoop<R>(ctx: RunContext, agent: AgentInfo, cfg: LoopConfig<R>): Promise<R> {
  const budget = cfg.budget ?? CONTEXT_BUDGETS.worker;
  const c: LoopContext = { system: cfg.system, working: cfg.user, retrieved: cfg.retrieved ?? "", notes: null, turns: [] };
  const externalTools = agent.tools;
  const kind = ROLE_KIND[agent.role];

  for (let step = 1; step <= cfg.maxSteps; step++) {
    const available = ctx.tools.usable(externalTools, agent.id);
    const mustFinish =
      step === cfg.maxSteps ||
      available.length === 0 ||
      ctx.budget.exhausted ||
      ctx.budget.workerCallsLeft() <= 0;

    const tools = {
      ...(mustFinish ? {} : ctx.tools.specs(available)),
      [FINISH_TOOL]: { description: cfg.reportDescription, inputSchema: cfg.reportSchema },
    };

    if (mustFinish && step > 1) {
      c.turns.push({
        role: "user",
        content: `Budget or step limit reached${ctx.budget.exhaustedBecause ? ` (${ctx.budget.exhaustedBecause})` : ""}. Submit your report now using what you have.`,
      });
    }

    const purpose = mustFinish ? "final report" : `research step ${step}`;
    let estimated = ctx.contexts.measureLoop(agent, purpose, c, budget);
    if (estimated > budget.compactAtTokens && (await ctx.compactor.compactLoop(agent, c, budget, cfg.prune))) {
      estimated = ctx.contexts.measureLoop(agent, purpose, c, budget);
    }

    const result = await ctx.llm.call({
      agentId: agent.id,
      kind,
      purpose,
      estimatedInputTokens: estimated,
      step,
      system: c.system,
      messages: loopMessages(c),
      tools,
      toolChoice: mustFinish ? { type: "tool", toolName: FINISH_TOOL } : "required",
    });
    ctx.contexts.calibrate(agent.id, estimated, result.inputTokens);

    if (result.text.trim()) {
      ctx.bus.emit({ type: "agent.note", data: { text: clip(result.text, 600) } }, agent.id);
    }
    c.turns.push(...result.responseMessages);
    // The SDK answers tool calls whose input it rejected itself; a second result for the same id is an API error.
    const answered = answeredToolCalls(result.responseMessages);

    const finish = result.toolCalls.find((call) => call.name === FINISH_TOOL);
    if (finish) {
      const parsed = cfg.reportSchema.safeParse(finish.input);
      if (parsed.success) return parsed.data;
      const unanswered = result.toolCalls.filter((call) => !answered.has(call.id));
      if (unanswered.length > 0) {
        c.turns.push({
          role: "tool",
          content: unanswered.map((call) => ({
            type: "tool-result" as const,
            toolCallId: call.id,
            toolName: call.name,
            output: {
              type: "error-text" as const,
              value:
                call.id === finish.id
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

    const pending = result.toolCalls.filter((call) => !answered.has(call.id));
    if (result.toolCalls.length === 0) {
      c.turns.push({ role: "user", content: `Use a tool: either gather evidence or call ${FINISH_TOOL}.` });
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

    c.turns.push({
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
