import { z } from "zod";
import { CONTEXT_BUDGETS } from "./config";
import type { RunContext } from "./context";
import type { EvaluationData } from "./events";
import { HOUSE_RULES, inboxText, reviewMaterial, toStepReport, type Mission } from "./roles";
import type { AgentInfo, Gap } from "./types";

const score05 = (what: string) => z.number().describe(`0-5 (integers): ${what}`);

export const evaluatorOutput = z.object({
  assessment: z.string().describe("2-3 sentences: how well the draft answers the question right now"),
  rubric: z.object({
    coverage: score05("are all key questions answered with specifics"),
    support: score05("are the important claims backed by cited, verified sources"),
    balance: score05("are counter-evidence and objections represented fairly"),
  }),
  enoughEvidence: z.boolean().describe("True when another research round would not materially change the brief"),
  gaps: z
    .array(
      z.object({
        question: z.string().describe("The concrete open question"),
        angle: z.string().describe("A short research angle a researcher could own, e.g. 'independent benchmarks since 2025'"),
        why: z.string().describe("Why it matters for the conclusion, one sentence"),
      }),
    )
    .describe("0-3 most important gaps, most important first. Empty when the evidence is enough."),
  unsupportedBlockIds: z.array(z.string()).describe("Block ids of important claims that lack adequate support"),
  conflict: z
    .string()
    .nullable()
    .describe("If sources or agents materially disagree and the conclusion depends on who is right, the disagreement in one sentence; otherwise null"),
  decisions: z.array(z.string()).describe("Key judgment calls behind your scores"),
  nextAction: z.string(),
});
export type EvaluatorOutput = z.infer<typeof evaluatorOutput>;

export interface Assessment {
  score: number;
  rubric: EvaluationData["rubric"];
  enoughEvidence: boolean;
  gaps: Gap[];
  unsupportedBlockIds: string[];
  conflict: string | null;
  assessment: string;
}

const clamp05 = (n: number) => Math.max(0, Math.min(5, Math.round(Number.isFinite(n) ? n : 0)));

export function scoreRubric(r: EvaluationData["rubric"]): number {
  return Math.round(((r.coverage + r.support + r.balance) / 15) * 100) / 10;
}

export const ENOUGH_SCORE = 7;

export interface DecisionInput {
  assessment: Pick<Assessment, "score" | "enoughEvidence" | "gaps" | "conflict">;
  round: number;
  maxLoops: number;
  hitlCount: number;
  maxHitl: number;
  askedConflict: boolean;
  canAffordLoop: boolean;
  extensionUsed: boolean;
}

export type Decision =
  | { decision: "synthesize"; reason: string }
  | { decision: "loop"; reason: string }
  | { decision: "ask_human"; hitl: "conflict" | "budget"; reason: string };

/** Pure decision rule: what the run does after an evaluation. */
export function decideNext(d: DecisionInput): Decision {
  const a = d.assessment;
  if (a.gaps.length === 0) return { decision: "synthesize", reason: "No gaps left worth another round." };
  if (a.enoughEvidence && a.score >= ENOUGH_SCORE) {
    return { decision: "synthesize", reason: `Score ${a.score}/10 with enough evidence; remaining gaps are minor.` };
  }
  if (d.round > d.maxLoops) {
    return { decision: "synthesize", reason: `Research loop limit reached (${d.maxLoops} follow-up rounds).` };
  }
  const canAsk = d.hitlCount < d.maxHitl;
  if (d.canAffordLoop) {
    if (a.conflict && canAsk && !d.askedConflict) {
      return { decision: "ask_human", hitl: "conflict", reason: `Evidence conflicts: ${a.conflict}` };
    }
    return { decision: "loop", reason: `Score ${a.score}/10 with ${a.gaps.length} gap${a.gaps.length === 1 ? "" : "s"}; budget allows another round.` };
  }
  if (!d.extensionUsed && canAsk) {
    return { decision: "ask_human", hitl: "budget", reason: "Gaps remain but the research budget is used up." };
  }
  return { decision: "synthesize", reason: "Gaps remain but the research budget is used up; synthesizing with what we have." };
}

function budgetText(ctx: RunContext): string {
  const left = ctx.budget.remaining();
  return `Budget left: ${left.searches} web searches, ${left.fetches} page fetches, ${Math.max(0, ctx.budget.workerCallsLeft())} worker LLM calls, $${left.costUsd.toFixed(2)}, ${Math.round(left.msLeft / 1000)}s of active time.${ctx.budget.exhausted ? ` The research budget is exhausted (${ctx.budget.exhaustedBecause}).` : ""}`;
}

/** The Gap Detector: scores the draft against a rubric and names the gaps a follow-up round should close. */
export async function runEvaluator(ctx: RunContext, agent: AgentInfo, mission: Mission, round: number): Promise<Assessment> {
  ctx.bus.emit({ type: "agent.started", data: { goal: agent.goal, round } }, agent.id);
  const system = `You are ${agent.name}, the evaluator of a team of AI agents writing a research brief. After each research round you decide whether the evidence is good enough to write the final brief, or which gaps a short follow-up round should close.

Score the draft on a 0-5 rubric (coverage, support, balance). Set enoughEvidence to true when another round would not materially change the conclusion. Name at most 3 gaps, each answerable with 1-2 web searches; skip gaps that cannot be closed with public web sources. Flag a conflict only when credible sources or agents disagree and the conclusion depends on who is right. Be strict but practical: the budget is small, so only ask for more research when it is likely to change the brief.

${HOUSE_RULES}`;
  const working = `MISSION (${mission.taskClass}): ${mission.objective}
Original question: "${mission.question}"
Key questions:
${mission.keyQuestions.map((q) => `- ${q}`).join("\n")}

This is the evaluation after research round ${round}. Follow-up rounds allowed: ${ctx.limits.maxResearchLoops}, used: ${round - 1}.
${budgetText(ctx)}

Messages for you:
${inboxText(ctx, agent)}`;
  const budget = CONTEXT_BUDGETS.synthesis;
  const material = reviewMaterial(ctx, { excerptChars: 240, keepCommentsWhenPruned: true });
  const parts = { system, working, retrieved: material.retrieved };
  let estimated = ctx.contexts.measureSingle(agent, `evaluate round ${round}`, parts, budget);
  const retrieved = ctx.compactor.fitRetrieved(agent, budget, parts, material.prune);
  if (retrieved !== parts.retrieved) {
    parts.retrieved = retrieved;
    estimated = ctx.contexts.measureSingle(agent, `evaluate round ${round}`, parts, budget);
  }

  const result = await ctx.llm.call({
    agentId: agent.id,
    kind: "evaluate",
    purpose: `evaluate round ${round}`,
    estimatedInputTokens: estimated,
    system,
    messages: [{ role: "user", content: `${working}\n\n${retrieved}\n\nEvaluate the draft now.` }],
    schema: evaluatorOutput,
    maxOutputTokens: 2500,
    timeoutMs: 90_000,
  });
  ctx.contexts.calibrate(agent.id, estimated, result.inputTokens);

  const out = result.structured as EvaluatorOutput;
  const rubric = { coverage: clamp05(out.rubric.coverage), support: clamp05(out.rubric.support), balance: clamp05(out.rubric.balance) };
  const assessment: Assessment = {
    score: scoreRubric(rubric),
    rubric,
    enoughEvidence: out.enoughEvidence,
    gaps: out.gaps.slice(0, 3).filter((g) => g.question.trim()),
    unsupportedBlockIds: out.unsupportedBlockIds.filter((id) => ctx.artifact.findBlock(id)),
    conflict: out.conflict?.trim() || null,
    assessment: out.assessment,
  };
  ctx.bus.emit(
    {
      type: "agent.completed",
      data: {
        report: toStepReport(
          {
            objective: `Decide whether round ${round} produced enough evidence`,
            rationale: out.assessment,
            decisions: out.decisions,
            observations: assessment.gaps.map((g) => `Gap: ${g.question} (${g.why})`),
            critiques: assessment.conflict ? [`Conflict: ${assessment.conflict}`] : [],
            nextAction: out.nextAction,
          },
          [],
        ),
        summary: `Round ${round}: score ${assessment.score}/10 · ${assessment.gaps.length} gap${assessment.gaps.length === 1 ? "" : "s"}`,
      },
    },
    agent.id,
  );
  return assessment;
}
