/**
 * Code-graded assertions, referenced from the Promptfoo configs as `file://evals/lib/asserts.ts:<name>`.
 * Each returns a GradingResult with a reason, so a failure in the Promptfoo viewer says what went wrong.
 */
import type { PlanOutput } from "../../src/harness/schemas";
import type { MissionReport } from "./mission-report";

interface GradingResult {
  pass: boolean;
  score: number;
  reason: string;
}
interface AssertContext {
  vars: Record<string, unknown>;
}

const result = (pass: boolean, reason: string): GradingResult => ({ pass, score: pass ? 1 : 0, reason });
const parse = <T>(output: unknown): T => (typeof output === "string" ? JSON.parse(output) : output) as T;
const expected = (v: unknown) => String(v ?? "").split("|").map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------------------------ planner */

/** `expected_class` may list alternatives, e.g. "comparison|decision", where both readings are defensible. */
export function taskClass(output: unknown, { vars }: AssertContext): GradingResult {
  const plan = parse<PlanOutput>(output);
  const want = expected(vars.expected_class);
  const got = plan.classification.taskClass;
  return result(want.includes(got), `classified as ${got}, expected ${want.join(" or ")}`);
}

/** The team rules the Orchestrator's prompt states, which the runtime otherwise has to repair. */
export function teamShape(output: unknown): GradingResult {
  const plan = parse<PlanOutput>(output);
  const team = plan.team;
  if (plan.classification.taskClass === "out_of_scope") {
    return result(team.length === 0, team.length ? `declined but still proposed ${team.length} agents` : "declined with an empty team");
  }
  const researchers = team.filter((m) => m.role === "researcher");
  const critics = team.filter((m) => m.role !== "researcher");
  const angles = researchers.map((r) => (r.angle ?? "").trim().toLowerCase());
  const names = team.map((m) => m.name.trim().toLowerCase());
  const problems = [
    team.length < 2 || team.length > 4 ? `${team.length} working agents (want 2-4)` : null,
    researchers.length < 1 || researchers.length > 3 ? `${researchers.length} researchers (want 1-3)` : null,
    critics.length < 1 ? "no skeptic or evidence verifier" : null,
    angles.some((a) => !a) ? "a researcher has no angle" : null,
    new Set(angles).size !== angles.length ? "researchers share an angle" : null,
    new Set(names).size !== names.length ? "duplicate agent names" : null,
    plan.keyQuestions.length < 2 || plan.keyQuestions.length > 5 ? `${plan.keyQuestions.length} key questions (want 2-5)` : null,
  ].filter(Boolean);
  return result(
    problems.length === 0,
    problems.length ? problems.join("; ") : `${researchers.length} researchers + ${critics.map((c) => c.role).join(", ")}`,
  );
}

/** Out-of-scope prompts that can be turned into a research question should be reframed, not declined. */
export function reframed(output: unknown): GradingResult {
  const plan = parse<PlanOutput>(output);
  const c = plan.classification;
  const ok = c.taskClass !== "out_of_scope" && !!c.reframedPrompt?.trim();
  return result(ok, ok ? `reframed as ${c.taskClass}: "${c.reframedPrompt}"` : `not reframed (${c.taskClass}, reframedPrompt=${c.reframedPrompt})`);
}

export function declined(output: unknown): GradingResult {
  const plan = parse<PlanOutput>(output);
  const c = plan.classification;
  const ok = c.taskClass === "out_of_scope" && !!c.declineReason?.trim();
  return result(ok, ok ? `declined: ${c.declineReason}` : `not declined (${c.taskClass})`);
}

/* ------------------------------------------------------------------ missions */

export function completed(output: unknown): GradingResult {
  const r = parse<MissionReport>(output);
  return result(r.status === "completed", `run ${r.status}`);
}

export function missionClass(output: unknown, { vars }: AssertContext): GradingResult {
  const r = parse<MissionReport>(output);
  const want = expected(vars.expected_class);
  return result(!!r.taskClass && want.includes(r.taskClass), `classified as ${r.taskClass}, expected ${want.join(" or ")}`);
}

export function allSectionsFilled(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  return result(m.emptySections.length === 0, m.emptySections.length ? `empty: ${m.emptySections.join(", ")}` : "all 8 sections filled");
}

/** Every cited source ID must have been retrieved in this run: no invented citations. */
export function citationsResolve(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  return result(m.unknownCitations.length === 0, m.unknownCitations.length ? `unknown source ids: ${m.unknownCitations.join(", ")}` : "all citations resolve");
}

/** At least 90% of the brief's claims carry a citation. */
export function claimsCited(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  const share = m.claims ? m.claimsWithSources / m.claims : 0;
  return result(m.claims > 0 && share >= 0.9, `${m.claimsWithSources}/${m.claims} claims cite a source`);
}

export function withinBudget(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  return result(m.costUsd <= m.costCeilingUsd, `$${m.costUsd.toFixed(3)} of a $${m.costCeilingUsd.toFixed(2)} ceiling, ${m.llmCalls} LLM calls`);
}

/** Agents stayed inside their tool permissions and the fetch allow-list (attempts are refused, but should not happen). */
export function toolDiscipline(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  const ok = m.deniedToolCalls === 0 && m.refusedFetches === 0;
  return result(ok, `${m.deniedToolCalls} denied tool calls, ${m.refusedFetches} refused fetches`);
}

export function noFailedAgents(output: unknown): GradingResult {
  const m = parse<MissionReport>(output).metrics;
  return result(m.failedAgents.length === 0, m.failedAgents.length ? `failed: ${m.failedAgents.join(", ")}` : "no agent failed");
}
