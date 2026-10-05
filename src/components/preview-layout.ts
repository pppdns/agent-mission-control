import type { MomentKind, PreviewMoment, RunPreview } from "@/harness/preview";
import type { AgentRole } from "@/harness/types";

export const VIEW_W = 400;
export const VIEW_H = 300;
export const VISITOR_NODE = "visitor";

export interface LayoutNode {
  id: string;
  role: AgentRole | "visitor";
  name: string;
  x: number;
  y: number;
}

export interface Layout {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  edges: { from: string; to: string }[];
}

const TOP = 34;
const BOTTOM = 258;
const SIDE = 52;

function spread(count: number): number[] {
  if (count === 1) return [VIEW_W / 2];
  const span = Math.min(VIEW_W - SIDE * 2, (count - 1) * 108);
  const start = (VIEW_W - span) / 2;
  return Array.from({ length: count }, (_, i) => start + (span * i) / (count - 1));
}

/** Deterministic rows: orchestrator (with Gap Detector and Visitor beside it), researchers, critics, editor. */
export function layoutPreview(preview: RunPreview): Layout {
  const agents = preview.agents;
  const orchestrator = agents.find((a) => a.role === "orchestrator");
  const evaluator = agents.find((a) => a.role === "evaluator");
  const researchers = agents.filter((a) => a.role === "researcher");
  const critics = agents.filter((a) => a.role === "skeptic" || a.role === "evidence_verifier");
  const editor = agents.filter((a) => a.role === "editor");
  const hasVisitor = preview.moments.some((m) => m.kind === "hitl");

  const middle = researchers.length > 4 ? [researchers.slice(0, Math.ceil(researchers.length / 2)), researchers.slice(Math.ceil(researchers.length / 2))] : [researchers];
  const rows = [...middle, critics, editor].filter((r) => r.length > 0);
  const step = rows.length > 0 ? (BOTTOM - TOP) / rows.length : 0;

  const nodes: LayoutNode[] = [];
  if (orchestrator) nodes.push({ id: orchestrator.id, role: "orchestrator", name: orchestrator.name, x: VIEW_W / 2, y: TOP });
  if (evaluator) nodes.push({ id: evaluator.id, role: "evaluator", name: evaluator.name, x: VIEW_W / 2 + 118, y: TOP });
  if (hasVisitor) nodes.push({ id: VISITOR_NODE, role: "visitor", name: "Visitor", x: VIEW_W / 2 - 118, y: TOP });
  rows.forEach((row, r) => {
    const xs = spread(row.length);
    row.forEach((a, i) => nodes.push({ id: a.id, role: a.role, name: a.name, x: xs[i], y: TOP + step * (r + 1) }));
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = agents.filter((a) => a.parentId && byId.has(a.parentId) && byId.has(a.id)).map((a) => ({ from: a.parentId as string, to: a.id }));
  if (hasVisitor && orchestrator) edges.push({ from: orchestrator.id, to: VISITOR_NODE });
  return { nodes, byId, edges };
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export function previewStats(p: RunPreview): string[] {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [
    plural(p.agents.length, "agent"),
    plural(p.rounds, "round"),
    plural(p.totals.searches, "search").replace("searchs", "searches"),
    `$${p.totals.costUsd.toFixed(2)}`,
    formatDuration(p.durationMs),
  ];
}

/** Phases of one reel, in milliseconds. */
export const REEL = { assembleMs: 2200, actMs: 6200, finishMs: 1600 } as const;
export const REEL_MS = REEL.assembleMs + REEL.actMs + REEL.finishMs;
export const PULSE_MS = 650;
const CAPTION_WINDOWS = 5;

const CAPTION_RANK: Record<MomentKind, number> = {
  loop: 9,
  hitl: 8,
  evaluate: 7,
  objection: 6,
  compact: 5,
  search: 4,
  fetch: 3,
  delegate: 2,
  message: 1,
  done: 0,
};

export interface ScheduledMoment {
  start: number;
  moment: PreviewMoment;
}

export interface Schedule {
  appear: Map<string, number>;
  moments: ScheduledMoment[];
  captions: { start: number; end: number; label: string; kind: MomentKind | "assemble" | "done" }[];
  doneAt: number;
}

/**
 * Maps a preview onto a fixed-length reel: the initial team assembles first, then the sampled moments
 * play at an even pace (later-round agents appear when they join), then the editor delivers.
 */
export function buildSchedule(preview: RunPreview): Schedule {
  const firstWork = preview.moments.find((m) => m.kind !== "delegate")?.at ?? 1;
  const initial = preview.agents.filter((a) => a.at <= firstWork);
  const appear = new Map<string, number>();
  const gap = REEL.assembleMs / (initial.length + 1);
  initial.forEach((a, i) => appear.set(a.id, Math.round(gap * i)));

  const acting = preview.moments.filter((m) => m.kind !== "done" && !(m.kind === "delegate" && m.at <= firstWork));
  const slot = REEL.actMs / Math.max(acting.length, 1);
  const moments: ScheduledMoment[] = acting.map((moment, i) => ({ start: Math.round(REEL.assembleMs + slot * i), moment }));

  for (const a of preview.agents) {
    if (appear.has(a.id)) continue;
    const next = moments.find((s) => s.moment.at >= a.at);
    appear.set(a.id, next ? Math.max(next.start - 250, REEL.assembleMs) : REEL.assembleMs + REEL.actMs);
  }
  const hitl = moments.find((s) => s.moment.kind === "hitl");
  if (hitl) appear.set(VISITOR_NODE, hitl.start);

  const captions: Schedule["captions"] = [{ start: 0, end: REEL.assembleMs, label: `Orchestrator assembles a team of ${preview.agents.length - 1} for this question`, kind: "assemble" }];
  const windowMs = REEL.actMs / CAPTION_WINDOWS;
  for (let w = 0; w < CAPTION_WINDOWS; w++) {
    const start = REEL.assembleMs + windowMs * w;
    const inWindow = moments.filter((s) => s.start >= start && s.start < start + windowMs);
    const best = inWindow.reduce<ScheduledMoment | null>((top, s) => (!top || CAPTION_RANK[s.moment.kind] > CAPTION_RANK[top.moment.kind] ? s : top), null);
    if (!best) continue;
    const prev = captions[captions.length - 1];
    if (prev.label === best.moment.label) prev.end = start + windowMs;
    else captions.push({ start, end: start + windowMs, label: best.moment.label, kind: best.moment.kind });
  }
  const doneAt = REEL.assembleMs + REEL.actMs;
  const editorName = preview.agents.find((a) => a.role === "editor")?.name ?? "Editor";
  captions.push({ start: doneAt, end: REEL_MS, label: `${editorName} delivers the brief`, kind: "done" });
  return { appear, moments, captions, doneAt };
}
