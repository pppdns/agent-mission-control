/**
 * Computes the numbers the video shows from the exported event logs, using the harness's own reducer.
 * Also lists each run's key moments (seq and replay time at 1x) so shots can target them.
 *
 *   pnpm tsx videos/amc-linkedin/capture/stats.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunEvent } from "../../../src/harness/events";
import { buildView, milestoneOf } from "../../../src/harness/view";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_GAP_MS = 1500;

interface IndexEntry {
  id: string;
  title: string | null;
  prompt: string;
  taskClass: string | null;
  featuredOrder: number | null;
}

const index = JSON.parse(readFileSync(join(HERE, "runs/index.json"), "utf8")) as IndexEntry[];

const runs = index.map((entry) => {
  const events = JSON.parse(readFileSync(join(HERE, `runs/${entry.id}.json`), "utf8")) as RunEvent[];
  const view = buildView(events);
  const totals = view.finalTotals ?? view.totals;

  const replayAt: number[] = [];
  events.forEach((e, i) => replayAt.push(i === 0 ? 0 : replayAt[i - 1] + Math.min(MAX_GAP_MS, Math.max(0, e.ts - events[i - 1].ts))));

  const counts: Record<string, number> = {};
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const roles: Record<string, number> = {};
  for (const id of view.agentOrder) roles[view.agents[id].info.role] = (roles[view.agents[id].info.role] ?? 0) + 1;

  const models = new Map<string, { provider: string; calls: number; costUsd: number }>();
  for (const call of Object.values(view.llm)) {
    const m = models.get(call.model) ?? { provider: call.provider, calls: 0, costUsd: 0 };
    m.calls += 1;
    m.costUsd += call.costUsd ?? 0;
    models.set(call.model, m);
  }

  const moments = events.flatMap((e, i) => {
    const at = { seq: e.seq, cursor: i + 1, replayMs: replayAt[i] };
    const milestone = milestoneOf(e);
    if (milestone) return [{ ...at, kind: milestone.kind, label: milestone.label }];
    if (e.type === "tool.requested") return [{ ...at, kind: "tool", label: `${e.agentId}: ${e.data.tool} ${JSON.stringify(e.data.params).slice(0, 80)}` }];
    if (e.type === "agent.message_sent" && e.data.message.type === "objection") return [{ ...at, kind: "objection", label: `${e.data.message.from} -> ${e.data.message.to}` }];
    if (e.type === "agent.started" && e.agentId === "editor") return [{ ...at, kind: "editor", label: "Editor starts the brief" }];
    if (e.type === "run.classified") return [{ ...at, kind: "classified", label: e.data.taskClass }];
    return [];
  });

  return {
    id: entry.id,
    title: view.classification?.briefTitle ?? entry.title ?? entry.prompt,
    prompt: entry.prompt,
    taskClass: view.classification?.taskClass ?? entry.taskClass,
    featuredOrder: entry.featuredOrder,
    agents: view.agentOrder.length,
    team: view.agentOrder.map((id) => ({ id, role: view.agents[id].info.role, name: view.agents[id].info.name, round: view.agents[id].info.round ?? 1 })),
    roles,
    rounds: Math.max(view.round, view.loops.length + 1),
    events: events.length,
    eventTypes: Object.keys(counts).length,
    messages: view.messages.length,
    objections: view.messages.filter((m) => m.message.type === "objection").length,
    llmCalls: totals.llmCalls,
    searches: totals.searches,
    fetches: totals.fetches,
    toolCalls: Object.keys(view.toolCalls).length,
    sources: view.sourceOrder.length,
    routingDecisions: view.routing.length,
    compactions: view.compactionOrder.length,
    compactionTokens: view.compactionOrder.map((id) => [view.compactions[id].beforeTokens, view.compactions[id].afterTokens]),
    evaluations: view.evaluations.map((ev) => ({ round: ev.round, score: ev.score, decision: ev.decision, gaps: ev.gaps.length })),
    hitl: view.hitlOrder.map((id) => ({ reason: view.hitl[id].reason, question: view.hitl[id].question })),
    checkpoints: view.checkpoints.length,
    artifactVersions: view.artifactLog.length,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    costUsd: totals.costUsd,
    durationMs: view.startTs !== null && view.endTs !== null ? view.endTs - view.startTs : null,
    replayMs: replayAt.at(-1) ?? 0,
    models: Object.fromEntries(models),
    counts,
    moments,
  };
});

const sum = (key: "agents" | "events" | "llmCalls" | "toolCalls" | "sources" | "routingDecisions" | "compactions" | "messages" | "inputTokens" | "outputTokens" | "costUsd") =>
  runs.reduce((acc, r) => acc + (r[key] as number), 0);

const aggregate = {
  runs: runs.length,
  agents: sum("agents"),
  events: sum("events"),
  llmCalls: sum("llmCalls"),
  toolCalls: sum("toolCalls"),
  sources: sum("sources"),
  messages: sum("messages"),
  routingDecisions: sum("routingDecisions"),
  compactions: sum("compactions"),
  tokens: sum("inputTokens") + sum("outputTokens"),
  costUsd: sum("costUsd"),
  avgCostUsd: sum("costUsd") / runs.length,
  eventTypes: new Set(runs.flatMap((r) => Object.keys(r.counts))).size,
  models: [...new Set(runs.flatMap((r) => Object.keys(r.models)))],
  distinctTeams: new Set(runs.map((r) => JSON.stringify(Object.entries(r.roles).sort()))).size,
};

writeFileSync(join(HERE, "stats.json"), JSON.stringify({ aggregate, runs }, null, 2));
console.log(JSON.stringify(aggregate, null, 2));
for (const r of runs) {
  console.log(
    `${r.id} ${r.taskClass?.padEnd(10)} agents=${r.agents} rounds=${r.rounds} roles=${JSON.stringify(r.roles)} tools=${r.toolCalls} sources=${r.sources} compactions=${r.compactions} evals=${r.evaluations.map((e) => e.score.toFixed(1)).join("/")} hitl=${r.hitl.map((h) => h.reason).join(",")} replay=${(r.replayMs / 1000).toFixed(0)}s  ${r.title}`,
  );
}
