/**
 * Turns a run's event log into what the mission evals grade: the final brief (as markdown, for model-graded checks)
 * and trajectory metrics (for code-graded checks). Live runs and recorded fixtures go through the same function,
 * so the offline regression suite checks exactly what the live suite checks.
 */
import { BUDGET_EXTENSION, DEFAULT_LIMITS } from "../../src/harness/config";
import type { RunEvent } from "../../src/harness/events";
import { buildView, type RunView } from "../../src/harness/view";
import { SECTION_ORDER, type Artifact } from "../../src/harness/types";

export interface MissionReport {
  prompt: string;
  status: RunView["phase"];
  taskClass: string | null;
  title: string | null;
  /** The final brief as markdown, with [sN] citations; what the LLM judge reads. */
  brief: string;
  /** Sources the brief could cite: id, title, url, excerpt. */
  sources: string;
  metrics: MissionMetrics;
}

export interface MissionMetrics {
  sectionsFilled: number;
  emptySections: string[];
  claims: number;
  claimsWithSources: number;
  /** Cited source IDs that were never retrieved in this run (hallucinated citations). */
  unknownCitations: string[];
  /** Tool calls the registry refused because the agent's role may not use that tool. */
  deniedToolCalls: number;
  /** fetch_page calls refused because the URL did not come from this run's own searches. */
  refusedFetches: number;
  failedAgents: string[];
  llmFailures: number;
  rounds: number;
  evaluationScores: number[];
  humanDecisions: number;
  compactions: number;
  costUsd: number;
  /** The per-run hard ceiling: the soft cost cap plus the one-time extension a visitor can approve. */
  costCeilingUsd: number;
  llmCalls: number;
  searches: number;
  fetches: number;
  agents: number;
  durationMs: number;
}

export function reportFromEvents(events: RunEvent[]): MissionReport {
  const view = buildView(events);
  const artifact = view.artifact;
  const known = new Set(view.sourceOrder);
  const blocks = artifact?.sections.flatMap((s) => s.blocks.map((b) => ({ ...b, section: s.id }))) ?? [];
  const cited = new Set(blocks.flatMap((b) => b.sourceIds));
  const claims = blocks.filter((b) => b.kind === "claim");
  const tools = Object.values(view.toolCalls);

  const totals = view.finalTotals ?? view.totals;
  const durationMs = (view.endTs ?? view.lastTs) - (view.startTs ?? view.lastTs);
  return {
    prompt: view.prompt ?? "",
    status: view.phase,
    taskClass: view.classification?.taskClass ?? null,
    title: artifact?.title ?? null,
    brief: artifact ? briefMarkdown(artifact) : "",
    sources: view.sourceOrder
      .map((id) => view.sources[id])
      .map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.snippet}`)
      .join("\n\n"),
    metrics: {
      sectionsFilled: artifact?.sections.filter((s) => s.blocks.length > 0).length ?? 0,
      emptySections: SECTION_ORDER.filter((id) => !artifact?.sections.find((s) => s.id === id)?.blocks.length),
      claims: claims.length,
      claimsWithSources: claims.filter((b) => b.sourceIds.length > 0).length,
      unknownCitations: [...cited].filter((id) => !known.has(id)),
      deniedToolCalls: tools.filter((t) => t.errors.some((e) => e.includes("is not permitted"))).length,
      refusedFetches: tools.filter((t) => t.tool === "fetch_page" && t.errors.some((e) => e.includes("only accepts URLs"))).length,
      failedAgents: Object.values(view.agents)
        .filter((a) => a.status === "failed")
        .map((a) => `${a.info.name}${a.error ? ` (${a.error.slice(0, 160)})` : ""}`),
      llmFailures: Object.values(view.llm).filter((c) => c.status === "failed").length,
      rounds: view.round,
      evaluationScores: view.evaluations.map((e) => e.score),
      humanDecisions: view.hitlOrder.length,
      compactions: view.compactionOrder.length,
      costUsd: round(totals.costUsd),
      costCeilingUsd: round((view.limits ?? DEFAULT_LIMITS).maxCostUsd + BUDGET_EXTENSION.costUsd),
      llmCalls: totals.llmCalls,
      searches: totals.searches,
      fetches: totals.fetches,
      agents: totals.agents,
      durationMs,
    },
  };
}

export function briefMarkdown(artifact: Artifact): string {
  const lines = [`# ${artifact.title}`];
  for (const section of artifact.sections) {
    lines.push("", `## ${section.title}`);
    for (const b of section.blocks) {
      const cites = b.sourceIds.length ? ` [${b.sourceIds.join(", ")}]` : "";
      lines.push(`- ${b.text}${cites}`);
    }
  }
  return lines.join("\n");
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
