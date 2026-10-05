import type { RunEvent } from "./events";
import type { AgentRole, TaskClass, Totals } from "./types";
import { buildView } from "./view";

/**
 * Compact digest of a finished run for the landing page: the team that was assembled and a sampled
 * set of key moments on a normalized 0..1 timeline. Full event logs are hundreds of KB; this stays small.
 */

export const PREVIEW_VERSION = 1;

export type MomentKind = "delegate" | "message" | "objection" | "search" | "fetch" | "evaluate" | "loop" | "hitl" | "compact" | "done";

export interface PreviewAgent {
  id: string;
  role: AgentRole;
  name: string;
  parentId: string | null;
  round: number;
  at: number;
}

export interface PreviewMoment {
  at: number;
  kind: MomentKind;
  from: string | null;
  to: string[];
  label: string;
}

export interface RunPreview {
  v: number;
  runId: string;
  title: string;
  question: string;
  taskClass: TaskClass | null;
  totals: Pick<Totals, "agents" | "llmCalls" | "searches" | "fetches" | "costUsd">;
  durationMs: number;
  rounds: number;
  agents: PreviewAgent[];
  moments: PreviewMoment[];
  headline: string | null;
}

export const MAX_MOMENTS = 28;
/** Idle stretches (waiting on a human, slow model calls) are capped so the timeline reflects activity. */
const GAP_CAP_MS = 4000;

const QUOTA: Record<MomentKind, number> = {
  done: 1,
  evaluate: 4,
  loop: 3,
  hitl: 2,
  compact: 2,
  objection: 4,
  delegate: 7,
  search: 5,
  fetch: 2,
  message: MAX_MOMENTS,
};

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

function pickEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  if (count <= 0) return [];
  if (count === 1) return [items[Math.floor(items.length / 2)]];
  const step = (items.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => items[Math.round(i * step)]);
}

export function buildPreview(events: RunEvent[], run: { id: string; title?: string | null; prompt?: string | null; taskClass?: string | null }): RunPreview {
  const sorted = [...events].sort((a, b) => a.seq - b.seq);
  const view = buildView(sorted);

  const position = new Map<number, number>();
  let clock = 0;
  let prevTs: number | null = null;
  for (const e of sorted) {
    if (prevTs !== null) clock += Math.min(Math.max(e.ts - prevTs, 0), GAP_CAP_MS);
    prevTs = e.ts;
    position.set(e.seq, clock);
  }
  const span = clock || 1;
  const at = (seq: number) => Math.round(((position.get(seq) ?? 0) / span) * 1000) / 1000;

  const nameOf = (id: string | null) => (id ? (view.agents[id]?.info.name ?? (id === "visitor" ? "Visitor" : id)) : "Agent");
  const spawnAt = new Map<string, number>();
  const candidates: (PreviewMoment & { seq: number })[] = [];
  let activeMs: number | null = null;

  for (const e of sorted) {
    switch (e.type) {
      case "agent.spawned":
        if (!spawnAt.has(e.data.agent.id)) spawnAt.set(e.data.agent.id, at(e.seq));
        break;
      case "agent.message_sent": {
        const m = e.data.message;
        const kind: MomentKind = m.type === "delegation" ? "delegate" : m.type === "objection" ? "objection" : "message";
        const verb = kind === "delegate" ? "briefs" : kind === "objection" ? "objects to" : `sends a ${m.type} to`;
        candidates.push({ seq: e.seq, at: at(e.seq), kind, from: m.from, to: [m.to], label: `${nameOf(m.from)} ${verb} ${nameOf(m.to)}: ${clip(m.content, 90)}` });
        break;
      }
      case "tool.requested": {
        const params = (e.data.params ?? {}) as Record<string, unknown>;
        const isSearch = /search/.test(e.data.tool);
        const target = typeof params.query === "string" ? `"${params.query}"` : typeof params.url === "string" ? params.url : e.data.tool;
        candidates.push({
          seq: e.seq,
          at: at(e.seq),
          kind: isSearch ? "search" : "fetch",
          from: e.agentId,
          to: [],
          label: `${nameOf(e.agentId)} ${isSearch ? "searches" : "reads"} ${clip(String(target), 80)}`,
        });
        break;
      }
      case "evaluation.completed": {
        const d = e.data;
        const next = d.decision === "synthesize" ? "ready to write" : d.decision === "loop" ? `${d.gaps.length} gap${d.gaps.length === 1 ? "" : "s"}, another round` : "asks a human";
        candidates.push({ seq: e.seq, at: at(e.seq), kind: "evaluate", from: e.agentId ?? "evaluator", to: [], label: `Gap Detector scores round ${d.round} at ${d.score.toFixed(1)}/10: ${next}` });
        break;
      }
      case "loop.started": {
        const d = e.data;
        candidates.push({
          seq: e.seq,
          at: at(e.seq),
          kind: "loop",
          from: "orchestrator",
          to: d.assignments.map((a) => a.agentId),
          label: `Round ${d.round}: ${d.assignments.length} agent${d.assignments.length === 1 ? "" : "s"} sent back to close the gaps`,
        });
        break;
      }
      case "hitl.requested":
        candidates.push({ seq: e.seq, at: at(e.seq), kind: "hitl", from: e.agentId ?? "orchestrator", to: ["visitor"], label: `Asks a human: ${clip(e.data.question, 90)}` });
        break;
      case "context.compacted":
        candidates.push({
          seq: e.seq,
          at: at(e.seq),
          kind: "compact",
          from: e.agentId,
          to: [],
          label: `${nameOf(e.agentId)} compacts its context from ${(e.data.beforeTokens / 1000).toFixed(1)}k to ${(e.data.afterTokens / 1000).toFixed(1)}k tokens`,
        });
        break;
      case "run.completed":
        activeMs = e.data.durationMs;
        candidates.push({ seq: e.seq, at: at(e.seq), kind: "done", from: "editor", to: [], label: "Editor delivers the final brief" });
        break;
    }
  }

  const byKind = new Map<MomentKind, (PreviewMoment & { seq: number })[]>();
  for (const c of candidates) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const picked: (PreviewMoment & { seq: number })[] = [];
  for (const kind of Object.keys(QUOTA) as MomentKind[]) {
    const room = MAX_MOMENTS - picked.length;
    if (room <= 0) break;
    picked.push(...pickEvenly(byKind.get(kind) ?? [], Math.min(QUOTA[kind], room)));
  }
  picked.sort((a, b) => a.seq - b.seq);
  const moments: PreviewMoment[] = picked.map((m) => ({ at: m.at, kind: m.kind, from: m.from, to: m.to, label: m.label }));

  const agents: PreviewAgent[] = view.agentOrder.map((id) => {
    const a = view.agents[id];
    return { id, role: a.info.role, name: a.info.name, parentId: a.info.parentId, round: a.info.round ?? 1, at: spawnAt.get(id) ?? 0 };
  });

  const sections = view.artifact?.sections ?? [];
  const headlineBlock =
    sections.find((s) => s.id === "recommendation")?.blocks[0] ?? sections.find((s) => s.id === "executive_summary")?.blocks[0] ?? null;
  const totals = view.finalTotals ?? view.totals;
  const durationMs = activeMs ?? (view.startTs !== null && view.endTs !== null ? view.endTs - view.startTs : 0);

  return {
    v: PREVIEW_VERSION,
    runId: run.id,
    title: view.classification?.briefTitle ?? run.title ?? view.artifact?.title ?? clip(run.prompt ?? view.prompt ?? "Untitled run", 80),
    question: run.prompt ?? view.prompt ?? "",
    taskClass: (view.classification?.taskClass !== "out_of_scope" ? view.classification?.taskClass : null) ?? ((run.taskClass as TaskClass | null) || null),
    totals: { agents: totals.agents || agents.length, llmCalls: totals.llmCalls, searches: totals.searches, fetches: totals.fetches, costUsd: totals.costUsd },
    durationMs,
    rounds: Math.max(view.round, view.loops.length + 1),
    agents,
    moments,
    headline: headlineBlock ? clip(headlineBlock.text, 220) : null,
  };
}
