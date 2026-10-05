import type { CompactionStrategy, EvaluationData, EventBody, RunEvent, ToolManifestEntry } from "./events";
import type {
  AgentInfo,
  AgentMessage,
  AgentStatus,
  Artifact,
  BudgetExtension,
  BudgetSnapshot,
  ContextBudget,
  ContextCategory,
  Gap,
  HitlOption,
  Limits,
  Provider,
  RouteName,
  RuleName,
  Source,
  StepReport,
  TaskClass,
  Totals,
} from "./types";
import { EMPTY_TOTALS } from "./types";

/**
 * Pure projection of the event log into UI state.
 * Live runs and replays feed the same reducer; a live run is just a log that is still growing.
 */

export type RunPhase = "waiting" | "running" | "paused" | "completed" | "failed" | "declined";

export interface ContextView {
  purpose: string;
  tokens: Record<ContextCategory, number>;
  total: number;
  budget: ContextBudget;
  ts: number;
}

export interface AgentView {
  info: AgentInfo;
  status: AgentStatus;
  report: StepReport | null;
  summary: string | null;
  error: string | null;
  notes: string[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  llmCalls: number;
  toolCalls: number;
  llmInFlight: number;
  toolsInFlight: number;
  activity: string | null;
  startedTs: number | null;
  endedTs: number | null;
  round: number;
  retries: number;
  compactions: number;
  /** Local arrival times, used to flash the node; 0 in replays built in one pass. */
  lastRetryAt: number | null;
  lastCompactionAt: number | null;
  context: ContextView | null;
  contextHistory: { ts: number; total: number; compacted: boolean }[];
}

export interface LlmView {
  callId: string;
  agentId: string;
  purpose: string;
  provider: Provider;
  model: string;
  route: RouteName;
  rule: RuleName | null;
  step: number | null;
  messageCount: number;
  promptChars: number;
  requestedTs: number;
  streamedChars: number;
  status: "running" | "done" | "failed" | "interrupted";
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  costUsd: number;
  finishReason: string | null;
  text: string;
  toolCalls: { id: string; name: string; input: unknown }[];
  structured: unknown | null;
  error: string | null;
}

export interface ToolView {
  toolCallId: string;
  agentId: string;
  tool: string;
  server: string | null;
  mcpTool: string | null;
  params: unknown;
  llmCallId: string | null;
  status: "running" | "done" | "failed" | "retrying";
  requestedTs: number;
  durationMs: number;
  resultPreview: string;
  resultChars: number;
  sourceIds: string[];
  attempts: number;
  errors: string[];
  arrivedAt: number;
  settledAt: number | null;
}

export interface MessageView {
  message: AgentMessage;
  seq: number;
  ts: number;
  arrivedAt: number;
}

export interface RoutingView {
  seq: number;
  ts: number;
  agentId: string | null;
  callId: string | null;
  rule: RuleName | null;
  route: RouteName;
  provider: Provider;
  model: string;
  reason: string;
  purpose: string | null;
}

export interface CompactionView {
  compactionId: string;
  agentId: string;
  seq: number;
  ts: number;
  strategy: CompactionStrategy;
  reason: string;
  status: "running" | "done";
  threshold: number | null;
  beforeTokens: number;
  afterTokens: number;
  removed: string[];
  summarized: string[];
  preserved: string[];
  compactedState: string;
  llmCallId: string | null;
}

export interface EvaluationView extends EvaluationData {
  seq: number;
  ts: number;
}

export interface LoopView {
  seq: number;
  ts: number;
  round: number;
  reason: string;
  gaps: Gap[];
  assignments: { agentId: string; goal: string }[];
}

export interface HitlView {
  requestId: string;
  seq: number;
  requestedTs: number;
  reason: "conflict" | "budget";
  question: string;
  context: string;
  options: HitlOption[];
  recommended: string;
  timeoutMs: number;
  deadlineTs: number;
  status: "pending" | "resolved";
  optionId: string | null;
  resolvedBy: "visitor" | "timeout" | null;
  waitedMs: number | null;
  resolvedTs: number | null;
}

export interface CheckpointView {
  checkpointId: string;
  seq: number;
  ts: number;
  phase: string;
  round: number;
  label: string;
}

export type TraceTone = "info" | "good" | "warn" | "bad";
export type TraceRef =
  | { type: "agent"; id: string }
  | { type: "message"; id: string }
  | { type: "llm"; id: string }
  | { type: "tool"; id: string }
  | { type: "source"; id: string }
  | { type: "compaction"; id: string }
  | { type: "evaluation"; id: string }
  | { type: "hitl"; id: string }
  | { type: "checkpoint"; id: string };

export interface TraceItem {
  seq: number;
  ts: number;
  agentId: string | null;
  kind: string;
  title: string;
  detail: string | null;
  tone: TraceTone;
  ref: TraceRef | null;
}

export interface Classification {
  taskClass: TaskClass | "out_of_scope";
  objective: string;
  briefTitle: string;
  reframedPrompt: string | null;
  declineReason: string | null;
  rationale: string;
  keyQuestions: string[];
}

export interface ArtifactLogEntry {
  version: number;
  ts: number;
  agentId: string | null;
  summary: string;
}

export interface RunView {
  phase: RunPhase;
  lastSeq: number;
  startTs: number | null;
  endTs: number | null;
  lastTs: number;
  prompt: string | null;
  limits: Limits | null;
  tools: ToolManifestEntry[];
  classification: Classification | null;
  agents: Record<string, AgentView>;
  agentOrder: string[];
  messages: MessageView[];
  llm: Record<string, LlmView>;
  toolCalls: Record<string, ToolView>;
  sources: Record<string, Omit<Source, "content">>;
  sourceOrder: string[];
  artifact: Artifact | null;
  artifactLog: ArtifactLogEntry[];
  trace: TraceItem[];
  totals: Totals;
  error: string | null;
  budgetExhausted: string | null;
  finalTotals: Totals | null;
  budget: BudgetSnapshot | null;
  budgetExtension: { extension: BudgetExtension; reason: string } | null;
  round: number;
  routing: RoutingView[];
  compactions: Record<string, CompactionView>;
  compactionOrder: string[];
  evaluations: EvaluationView[];
  loops: LoopView[];
  hitl: Record<string, HitlView>;
  hitlOrder: string[];
  pendingHitl: string | null;
  checkpoints: CheckpointView[];
  resumes: { seq: number; ts: number; checkpointId: string | null; reason: string }[];
}

export function initialView(): RunView {
  return {
    phase: "waiting",
    lastSeq: 0,
    startTs: null,
    endTs: null,
    lastTs: 0,
    prompt: null,
    limits: null,
    tools: [],
    classification: null,
    agents: {},
    agentOrder: [],
    messages: [],
    llm: {},
    toolCalls: {},
    sources: {},
    sourceOrder: [],
    artifact: null,
    artifactLog: [],
    trace: [],
    totals: { ...EMPTY_TOTALS },
    error: null,
    budgetExhausted: null,
    finalTotals: null,
    budget: null,
    budgetExtension: null,
    round: 1,
    routing: [],
    compactions: {},
    compactionOrder: [],
    evaluations: [],
    loops: [],
    hitl: {},
    hitlOrder: [],
    pendingHitl: null,
    checkpoints: [],
    resumes: [],
  };
}

function patchAgent(state: RunView, id: string | null, fn: (a: AgentView) => AgentView): RunView {
  if (!id || !state.agents[id]) return state;
  return { ...state, agents: { ...state.agents, [id]: fn(state.agents[id]) } };
}

function trace(state: RunView, e: RunEvent, item: Omit<TraceItem, "seq" | "ts" | "agentId"> & { agentId?: string | null }): RunView {
  return {
    ...state,
    trace: [...state.trace, { seq: e.seq, ts: e.ts, agentId: item.agentId === undefined ? e.agentId : item.agentId, ...item }],
  };
}

const clipText = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
const tokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const agentRef = (id: string | null): TraceRef | null => (id ? { type: "agent", id } : null);
const nameOf = (s: RunView, id: string | null) => s.agents[id ?? ""]?.info.name ?? (id === "visitor" ? "Visitor" : (id ?? "Agent"));

function newAgent(info: AgentInfo): AgentView {
  return {
    info,
    status: "spawned",
    report: null,
    summary: null,
    error: null,
    notes: [],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    llmCalls: 0,
    toolCalls: 0,
    llmInFlight: 0,
    toolsInFlight: 0,
    activity: null,
    startedTs: null,
    endedTs: null,
    round: info.round ?? 1,
    retries: 0,
    compactions: 0,
    lastRetryAt: null,
    lastCompactionAt: null,
    context: null,
    contextHistory: [],
  };
}

export function applyEvent(prev: RunView, e: RunEvent, now: number = Date.now()): RunView {
  if (e.seq <= prev.lastSeq) return prev;
  let s: RunView = { ...prev, lastSeq: e.seq, lastTs: e.ts, startTs: prev.startTs ?? e.ts };
  const body = e as RunEvent & EventBody;

  switch (body.type) {
    case "run.created":
      s.prompt = body.data.prompt;
      return trace(s, e, { kind: "run", title: "Run created", detail: clipText(body.data.prompt, 140), tone: "info", ref: null });

    case "run.started":
      s.phase = "running";
      s.limits = body.data.limits;
      s.tools = body.data.tools;
      return trace(s, e, {
        kind: "run",
        title: "Run started",
        detail: `${body.data.tools.length} MCP tools registered: ${body.data.tools.map((t) => `${t.server}/${t.mcpTool}`).join(", ")}`,
        tone: "info",
        ref: null,
      });

    case "run.classified": {
      s.classification = body.data;
      if (body.data.taskClass === "out_of_scope") s.phase = "declined";
      const reframed = body.data.reframedPrompt ? ` Reframed: "${body.data.reframedPrompt}"` : "";
      return trace(s, e, {
        kind: "plan",
        title: body.data.taskClass === "out_of_scope" ? "Prompt declined (out of scope)" : `Classified as ${body.data.taskClass}`,
        detail: `${body.data.rationale}${reframed}`,
        tone: body.data.taskClass === "out_of_scope" ? "warn" : "info",
        ref: null,
      });
    }

    case "run.completed":
      s.phase = s.phase === "declined" ? "declined" : "completed";
      s.endTs = e.ts;
      s.pendingHitl = null;
      s.finalTotals = body.data.totals;
      s.totals = { ...s.totals, ...body.data.totals };
      return trace(s, e, { kind: "run", title: "Run completed", detail: `${(body.data.durationMs / 1000).toFixed(1)}s of active time`, tone: "good", ref: null });

    case "run.failed": {
      s.phase = "failed";
      s.endTs = e.ts;
      s.error = body.data.error;
      s.pendingHitl = null;
      s.finalTotals = body.data.totals;
      // An external failure reports the last synced totals, which can lag the live ones.
      const merged = { ...s.totals };
      for (const key of Object.keys(merged) as (keyof Totals)[]) merged[key] = Math.max(merged[key], body.data.totals[key] ?? 0);
      s.totals = merged;
      return trace(s, e, { kind: "run", title: "Run failed", detail: body.data.error, tone: "bad", ref: null });
    }

    case "run.resumed": {
      const d = body.data;
      const keepSources = new Set(d.sourceIds);
      const keepMessages = new Set(d.messageIds);
      const llm: Record<string, LlmView> = {};
      for (const [id, call] of Object.entries(s.llm)) llm[id] = call.status === "running" ? { ...call, status: "interrupted", error: "Interrupted: the worker restarted." } : call;
      const toolCalls: Record<string, ToolView> = {};
      for (const [id, t] of Object.entries(s.toolCalls)) {
        toolCalls[id] = t.status === "running" || t.status === "retrying" ? { ...t, status: "failed", errors: [...t.errors, "Interrupted: the worker restarted."], settledAt: now } : t;
      }
      const agents: Record<string, AgentView> = {};
      for (const id of s.agentOrder) {
        const status = d.agentStatus[id];
        if (!status) continue;
        agents[id] = { ...s.agents[id], status, llmInFlight: 0, toolsInFlight: 0, activity: null };
      }
      const compactions: Record<string, CompactionView> = {};
      for (const [id, c] of Object.entries(s.compactions)) compactions[id] = c.status === "running" ? { ...c, status: "done", reason: `${c.reason} (interrupted)` } : c;
      s = {
        ...s,
        phase: "running",
        endTs: null,
        error: null,
        llm,
        toolCalls,
        agents,
        agentOrder: s.agentOrder.filter((id) => agents[id]),
        sources: Object.fromEntries(Object.entries(s.sources).filter(([id]) => keepSources.has(id))),
        sourceOrder: s.sourceOrder.filter((id) => keepSources.has(id)),
        messages: s.messages.filter((m) => keepMessages.has(m.message.id)),
        artifact: d.artifact ?? (d.checkpointId ? s.artifact : null),
        compactions,
        round: d.round,
        pendingHitl: d.phase === "hitl" ? s.pendingHitl : null,
        resumes: [...s.resumes, { seq: e.seq, ts: e.ts, checkpointId: d.checkpointId, reason: d.reason }],
      };
      return trace(s, e, { kind: "checkpoint", title: d.checkpointId ? `Resumed from ${d.checkpointId}` : "Restarted after a crash", detail: d.reason, tone: "warn", ref: d.checkpointId ? { type: "checkpoint", id: d.checkpointId } : null });
    }

    case "budget.exhausted":
      s.budgetExhausted = body.data.reason;
      return trace(s, e, { kind: "budget", title: "Research budget exhausted", detail: body.data.reason, tone: "warn", ref: null });

    case "budget.updated": {
      const b = body.data.snapshot;
      s.budget = b;
      s.budgetExhausted = b.exhausted;
      s.totals = { ...s.totals, searches: b.searches.used, fetches: b.fetches.used };
      return s;
    }

    case "budget.extended": {
      const x = body.data.extension;
      s.budgetExtension = body.data;
      s.budgetExhausted = null;
      return trace(s, e, {
        kind: "budget",
        title: "Budget extended (one-time)",
        detail: `+${x.searches} searches · +${x.fetches} fetch · +${x.llmCalls} LLM calls · +$${x.costUsd.toFixed(2)} · ${body.data.reason}`,
        tone: "good",
        ref: null,
      });
    }

    case "routing.decided": {
      const d = body.data;
      s.routing = [
        ...s.routing,
        { seq: e.seq, ts: e.ts, agentId: e.agentId, callId: d.callId, rule: d.rule ?? null, route: d.route, provider: d.provider, model: d.model, reason: d.reason, purpose: d.purpose ?? null },
      ];
      if (d.rule === "escalate_large_context") {
        return trace(s, e, { kind: "routing", title: `Escalated to ${d.model}`, detail: d.reason, tone: "warn", ref: d.callId ? { type: "llm", id: d.callId } : null });
      }
      return s;
    }

    case "agent.spawned": {
      const info = body.data.agent;
      const existing = s.agents[info.id];
      s.agents = { ...s.agents, [info.id]: existing ? { ...existing, info } : newAgent(info) };
      if (!existing) s.agentOrder = [...s.agentOrder, info.id];
      s.totals = { ...s.totals, agents: s.agentOrder.length };
      return trace(s, e, {
        kind: "agent",
        agentId: info.id,
        title: `Spawned ${info.name}${(info.round ?? 1) > 1 ? ` (round ${info.round})` : ""}`,
        detail: `${info.model} · ${info.rule ? `rule ${info.rule}` : `route ${info.route}`}`,
        tone: "info",
        ref: { type: "agent", id: info.id },
      });
    }

    case "agent.started":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "running", startedTs: a.startedTs ?? e.ts, endedTs: null, activity: "starting", round: body.data.round ?? a.round }));
      return trace(s, e, {
        kind: "agent",
        title: `${nameOf(s, e.agentId)} started${(body.data.round ?? 1) > 1 ? ` (round ${body.data.round})` : ""}`,
        detail: null,
        tone: "info",
        ref: agentRef(e.agentId),
      });

    case "agent.retasked":
      s = patchAgent(s, e.agentId, (a) => ({
        ...a,
        info: { ...a.info, goal: body.data.goal, angle: body.data.angle },
        status: "running",
        round: body.data.round,
        endedTs: null,
        activity: "re-tasked",
      }));
      return trace(s, e, { kind: "loop", title: `${nameOf(s, e.agentId)} re-tasked for round ${body.data.round}`, detail: clipText(body.data.goal, 200), tone: "info", ref: agentRef(e.agentId) });

    case "agent.note":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, notes: [...a.notes, body.data.text] }));
      return trace(s, e, { kind: "note", title: "Note", detail: clipText(body.data.text, 220), tone: "info", ref: agentRef(e.agentId) });

    case "agent.message_sent": {
      const m = body.data.message;
      s.messages = [...s.messages, { message: m, seq: e.seq, ts: e.ts, arrivedAt: now }];
      return trace(s, e, {
        kind: "message",
        agentId: m.from,
        title: `${nameOf(s, m.from)} → ${nameOf(s, m.to)} · ${m.type}`,
        detail: clipText(m.content, 200),
        tone: m.type === "objection" ? "warn" : "info",
        ref: { type: "message", id: m.id },
      });
    }

    case "agent.retrying":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, retries: a.retries + 1, lastRetryAt: now }));
      return trace(s, e, {
        kind: "retry",
        title: body.data.fallbackModel ? `Falling back to ${body.data.fallbackModel}` : "Retrying",
        detail: body.data.reason,
        tone: "warn",
        ref: agentRef(e.agentId),
      });

    case "agent.completed":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "completed", report: body.data.report, summary: body.data.summary, endedTs: e.ts, activity: null }));
      return trace(s, e, { kind: "agent", title: `${nameOf(s, e.agentId)} completed`, detail: body.data.summary, tone: "good", ref: agentRef(e.agentId) });

    case "agent.failed":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "failed", error: body.data.error, endedTs: e.ts, activity: null }));
      return trace(s, e, { kind: "agent", title: `${nameOf(s, e.agentId)} failed`, detail: body.data.error, tone: "bad", ref: agentRef(e.agentId) });

    case "llm.requested": {
      const d = body.data;
      s.llm = {
        ...s.llm,
        [d.callId]: {
          callId: d.callId,
          agentId: e.agentId ?? "",
          purpose: d.purpose,
          provider: d.provider,
          model: d.model,
          route: d.route,
          rule: d.rule ?? null,
          step: d.step,
          messageCount: d.messageCount,
          promptChars: d.promptChars,
          requestedTs: e.ts,
          streamedChars: 0,
          status: "running",
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          latencyMs: 0,
          costUsd: 0,
          finishReason: null,
          text: "",
          toolCalls: [],
          structured: null,
          error: null,
        },
      };
      return patchAgent(s, e.agentId, (a) => ({
        ...a,
        llmInFlight: a.llmInFlight + 1,
        activity: d.purpose,
      }));
    }

    case "llm.streaming": {
      const d = body.data;
      const call = s.llm[d.callId];
      if (!call || call.status !== "running") return s;
      s.llm = { ...s.llm, [d.callId]: { ...call, streamedChars: d.outputChars } };
      const kchars = d.outputChars >= 1000 ? `${(d.outputChars / 1000).toFixed(1)}k` : String(d.outputChars);
      return patchAgent(s, e.agentId, (a) => ({ ...a, activity: `${call.purpose} · ${kchars} chars` }));
    }

    case "llm.completed": {
      const d = body.data;
      const prevCall = s.llm[d.callId];
      if (prevCall) {
        s.llm = {
          ...s.llm,
          [d.callId]: {
            ...prevCall,
            status: "done",
            inputTokens: d.inputTokens,
            outputTokens: d.outputTokens,
            cachedTokens: d.cachedTokens,
            latencyMs: d.latencyMs,
            costUsd: d.costUsd,
            finishReason: d.finishReason,
            text: d.text,
            toolCalls: d.toolCalls,
            structured: d.structured,
          },
        };
      }
      s.totals = {
        ...s.totals,
        inputTokens: s.totals.inputTokens + d.inputTokens,
        outputTokens: s.totals.outputTokens + d.outputTokens,
        cachedTokens: s.totals.cachedTokens + d.cachedTokens,
        costUsd: s.totals.costUsd + d.costUsd,
        llmCalls: s.totals.llmCalls + 1,
      };
      s = patchAgent(s, e.agentId, (a) => ({
        ...a,
        // The model actually serving the agent's main work (a provider fallback changes it); compaction calls don't.
        info: prevCall && prevCall.rule !== "simple_compaction" && a.info.model !== d.model ? { ...a.info, provider: d.provider, model: d.model } : a.info,
        llmInFlight: Math.max(0, a.llmInFlight - 1),
        activity:
          a.llmInFlight <= 1 && a.toolsInFlight === 0
            ? a.info.role === "orchestrator" && a.status === "running"
              ? "coordinating the team"
              : null
            : a.activity,
        llmCalls: a.llmCalls + 1,
        inputTokens: a.inputTokens + d.inputTokens,
        outputTokens: a.outputTokens + d.outputTokens,
        costUsd: a.costUsd + d.costUsd,
      }));
      const calls = d.toolCalls.map((c) => c.name).join(", ");
      return trace(s, e, {
        kind: "llm",
        title: `LLM · ${d.model}`,
        detail: `${d.inputTokens.toLocaleString()} in · ${d.outputTokens.toLocaleString()} out · ${(d.latencyMs / 1000).toFixed(1)}s · $${d.costUsd.toFixed(4)}${calls ? ` → ${calls}` : ""}`,
        tone: "info",
        ref: { type: "llm", id: d.callId },
      });
    }

    case "llm.failed": {
      const d = body.data;
      const prevCall = s.llm[d.callId];
      if (prevCall) s.llm = { ...s.llm, [d.callId]: { ...prevCall, status: "failed", error: d.error, latencyMs: d.latencyMs } };
      s = patchAgent(s, e.agentId, (a) => ({ ...a, llmInFlight: Math.max(0, a.llmInFlight - 1) }));
      return trace(s, e, { kind: "llm", title: `LLM failed · ${d.model}`, detail: d.error, tone: "bad", ref: { type: "llm", id: d.callId } });
    }

    case "tool.requested": {
      const d = body.data;
      const existing = s.toolCalls[d.toolCallId];
      s.toolCalls = {
        ...s.toolCalls,
        [d.toolCallId]: {
          toolCallId: d.toolCallId,
          agentId: e.agentId ?? "",
          tool: d.tool,
          server: d.server,
          mcpTool: d.mcpTool,
          params: d.params,
          llmCallId: d.llmCallId,
          status: "running",
          requestedTs: e.ts,
          durationMs: 0,
          resultPreview: "",
          resultChars: 0,
          sourceIds: [],
          attempts: existing?.attempts ?? 0,
          errors: [],
          arrivedAt: now,
          settledAt: null,
        },
      };
      s = patchAgent(s, e.agentId, (a) => ({ ...a, toolsInFlight: a.toolsInFlight + 1, toolCalls: a.toolCalls + 1, activity: `${d.tool}` }));
      const params = d.params as { query?: string; url?: string } | null;
      return trace(s, e, {
        kind: "tool",
        title: `${d.tool}${d.server ? ` · ${d.server} MCP` : ""}`,
        detail: params?.query ?? params?.url ?? null,
        tone: "info",
        ref: { type: "tool", id: d.toolCallId },
      });
    }

    case "tool.completed": {
      const d = body.data;
      const t = s.toolCalls[d.toolCallId];
      if (t) {
        s.toolCalls = {
          ...s.toolCalls,
          [d.toolCallId]: { ...t, status: "done", durationMs: d.durationMs, resultPreview: d.resultPreview, resultChars: d.resultChars, sourceIds: d.sourceIds, attempts: t.attempts + 1, settledAt: now },
        };
        // Logs recorded before budget snapshots existed: count usage from completed calls instead.
        if (!s.budget) {
          const manifest = s.tools.find((m) => m.name === d.tool);
          if (manifest?.budget === "search") s.totals = { ...s.totals, searches: s.totals.searches + 1 };
          if (manifest?.budget === "fetch") s.totals = { ...s.totals, fetches: s.totals.fetches + 1 };
        }
      }
      s = patchAgent(s, e.agentId, (a) => ({ ...a, toolsInFlight: Math.max(0, a.toolsInFlight - 1) }));
      return trace(s, e, {
        kind: "tool",
        title: `${d.tool} returned`,
        detail: `${d.sourceIds.length ? `${d.sourceIds.length} sources · ` : ""}${(d.durationMs / 1000).toFixed(1)}s`,
        tone: "good",
        ref: { type: "tool", id: d.toolCallId },
      });
    }

    case "tool.failed": {
      const d = body.data;
      const t = s.toolCalls[d.toolCallId];
      if (t) {
        s.toolCalls = {
          ...s.toolCalls,
          [d.toolCallId]: {
            ...t,
            status: d.willRetry ? "retrying" : "failed",
            durationMs: d.durationMs,
            attempts: Math.max(t.attempts, d.attempt),
            errors: [...t.errors, d.error],
            settledAt: d.willRetry ? null : now,
          },
        };
      }
      if (!d.willRetry) s = patchAgent(s, e.agentId, (a) => ({ ...a, toolsInFlight: Math.max(0, a.toolsInFlight - 1) }));
      return trace(s, e, {
        kind: "tool",
        title: `${d.tool} ${d.willRetry ? "failed, retrying" : "failed"}`,
        detail: d.error,
        tone: d.willRetry ? "warn" : "bad",
        ref: { type: "tool", id: d.toolCallId },
      });
    }

    case "source.added": {
      const src = body.data.source;
      if (!s.sources[src.id]) s.sourceOrder = [...s.sourceOrder, src.id];
      s.sources = { ...s.sources, [src.id]: src };
      return s;
    }

    case "artifact.created":
      s.artifact = body.data.artifact;
      s.artifactLog = [...s.artifactLog, { version: body.data.artifact.version, ts: e.ts, agentId: e.agentId, summary: "Artifact created" }];
      return trace(s, e, { kind: "artifact", title: "Shared brief created", detail: body.data.artifact.title, tone: "info", ref: null });

    case "artifact.updated": {
      if (!s.artifact) return s;
      const d = body.data;
      const section = d.section;
      s.artifact = {
        ...s.artifact,
        version: d.version,
        title: d.title ?? s.artifact.title,
        sections: section ? s.artifact.sections.map((x) => (x.id === section.id ? section : x)) : s.artifact.sections,
      };
      s.artifactLog = [...s.artifactLog, { version: d.version, ts: e.ts, agentId: e.agentId, summary: d.summary }];
      return trace(s, e, { kind: "artifact", title: `Brief v${d.version}`, detail: d.summary, tone: "info", ref: null });
    }

    case "context.updated": {
      const d = body.data;
      return patchAgent(s, e.agentId, (a) => ({
        ...a,
        context: { purpose: d.purpose, tokens: d.tokens, total: d.total, budget: d.budget, ts: e.ts },
        contextHistory: [...a.contextHistory, { ts: e.ts, total: d.total, compacted: false }].slice(-40),
      }));
    }

    case "context.threshold_reached":
      return trace(s, e, {
        kind: "context",
        title: `${nameOf(s, e.agentId)} hit the context threshold`,
        detail: `${body.data.total.toLocaleString()} of ${body.data.threshold.toLocaleString()} tokens`,
        tone: "warn",
        ref: agentRef(e.agentId),
      });

    case "context.compacting": {
      const d = body.data;
      s.compactions = {
        ...s.compactions,
        [d.compactionId]: {
          compactionId: d.compactionId,
          agentId: e.agentId ?? "",
          seq: e.seq,
          ts: e.ts,
          strategy: d.strategy,
          reason: d.reason,
          status: "running",
          threshold: s.agents[e.agentId ?? ""]?.context?.budget.compactAtTokens ?? null,
          beforeTokens: s.agents[e.agentId ?? ""]?.context?.total ?? 0,
          afterTokens: 0,
          removed: [],
          summarized: [],
          preserved: [],
          compactedState: "",
          llmCallId: null,
        },
      };
      if (!s.compactionOrder.includes(d.compactionId)) s.compactionOrder = [...s.compactionOrder, d.compactionId];
      return patchAgent(s, e.agentId, (a) => ({ ...a, activity: `compacting context (${d.strategy})`, lastCompactionAt: now }));
    }

    case "context.compacted": {
      const d = body.data;
      const prevC = s.compactions[d.compactionId];
      s.compactions = {
        ...s.compactions,
        [d.compactionId]: {
          agentId: e.agentId ?? "",
          seq: prevC?.seq ?? e.seq,
          ts: prevC?.ts ?? e.ts,
          threshold: prevC?.threshold ?? null,
          ...d,
          status: "done",
        },
      };
      if (!s.compactionOrder.includes(d.compactionId)) s.compactionOrder = [...s.compactionOrder, d.compactionId];
      s = patchAgent(s, e.agentId, (a) => ({
        ...a,
        compactions: a.compactions + 1,
        lastCompactionAt: now,
        activity: a.activity?.startsWith("compacting") ? null : a.activity,
        contextHistory: [...a.contextHistory, { ts: e.ts, total: d.afterTokens, compacted: true }].slice(-40),
      }));
      return trace(s, e, {
        kind: "context",
        title: `${nameOf(s, e.agentId)} compacted context · ${d.strategy}`,
        detail: `${tokens(d.beforeTokens)} → ${tokens(d.afterTokens)} tokens`,
        tone: "info",
        ref: { type: "compaction", id: d.compactionId },
      });
    }

    case "evaluation.completed": {
      const d = body.data;
      s.evaluations = [...s.evaluations, { ...d, seq: e.seq, ts: e.ts }];
      const decision = d.decision === "synthesize" ? "synthesize" : d.decision === "loop" ? `loop to round ${d.round + 1}` : "ask the visitor";
      return trace(s, e, {
        kind: "evaluation",
        title: `Gap Detector · ${d.score}/10 → ${decision}`,
        detail: d.reason,
        tone: d.decision === "synthesize" ? "good" : "warn",
        ref: { type: "evaluation", id: String(e.seq) },
      });
    }

    case "loop.started": {
      const d = body.data;
      s.round = d.round;
      s.loops = [...s.loops, { seq: e.seq, ts: e.ts, ...d }];
      return trace(s, e, {
        kind: "loop",
        title: `Research round ${d.round} started`,
        detail: `${d.gaps.length} gap${d.gaps.length === 1 ? "" : "s"}: ${d.gaps.map((g) => g.question).join(" · ")}`,
        tone: "info",
        ref: { type: "evaluation", id: String(s.evaluations.at(-1)?.seq ?? "") },
      });
    }

    case "hitl.requested": {
      const d = body.data;
      s.hitl = {
        ...s.hitl,
        [d.requestId]: {
          requestId: d.requestId,
          seq: e.seq,
          requestedTs: e.ts,
          reason: d.reason,
          question: d.question,
          context: d.context,
          options: d.options,
          recommended: d.recommended,
          timeoutMs: d.timeoutMs,
          deadlineTs: d.deadlineTs,
          status: "pending",
          optionId: null,
          resolvedBy: null,
          waitedMs: null,
          resolvedTs: null,
        },
      };
      if (!s.hitlOrder.includes(d.requestId)) s.hitlOrder = [...s.hitlOrder, d.requestId];
      s.pendingHitl = d.requestId;
      s.phase = "paused";
      return trace(s, e, { kind: "hitl", title: "Waiting for a human decision", detail: d.question, tone: "warn", ref: { type: "hitl", id: d.requestId } });
    }

    case "hitl.resolved": {
      const d = body.data;
      const req = s.hitl[d.requestId];
      if (req) {
        s.hitl = { ...s.hitl, [d.requestId]: { ...req, status: "resolved", optionId: d.optionId, resolvedBy: d.resolvedBy, waitedMs: d.waitedMs, resolvedTs: e.ts } };
      }
      if (s.pendingHitl === d.requestId) s.pendingHitl = null;
      if (s.phase === "paused") s.phase = "running";
      const label = req?.options.find((o) => o.id === d.optionId)?.label ?? d.optionId;
      return trace(s, e, {
        kind: "hitl",
        agentId: "visitor",
        title: d.resolvedBy === "visitor" ? `Visitor chose "${label}"` : `No answer in time → "${label}"`,
        detail: `after ${(d.waitedMs / 1000).toFixed(0)}s`,
        tone: "good",
        ref: { type: "hitl", id: d.requestId },
      });
    }

    case "checkpoint.created": {
      const d = body.data;
      s.checkpoints = [...s.checkpoints, { ...d, seq: e.seq, ts: e.ts }];
      return trace(s, e, { kind: "checkpoint", title: `Checkpoint ${d.checkpointId}`, detail: d.label, tone: "info", ref: { type: "checkpoint", id: d.checkpointId } });
    }
  }
  return s;
}

export function buildView(events: RunEvent[], from: RunView = initialView()): RunView {
  return events.reduce((view, e) => applyEvent(view, e, 0), from);
}

export function elapsedMs(view: RunView, nowOffset: number): number {
  if (view.startTs === null) return 0;
  if (view.endTs !== null) return view.endTs - view.startTs;
  return view.lastTs - view.startTs + nowOffset;
}

/** Events worth a marker on the replay timeline. */
export type MilestoneKind = "spawn" | "loop" | "compaction" | "hitl" | "checkpoint" | "evaluation" | "end";

export function milestoneOf(e: RunEvent): { kind: MilestoneKind; label: string } | null {
  const body = e as RunEvent & EventBody;
  switch (body.type) {
    case "agent.spawned":
      return { kind: "spawn", label: `Spawned ${body.data.agent.name}` };
    case "loop.started":
      return { kind: "loop", label: `Round ${body.data.round}` };
    case "context.compacted":
      return { kind: "compaction", label: `Compaction (${body.data.strategy})` };
    case "hitl.requested":
      return { kind: "hitl", label: "Human decision requested" };
    case "hitl.resolved":
      return { kind: "hitl", label: "Human decision made" };
    case "checkpoint.created":
      return { kind: "checkpoint", label: `Checkpoint: ${body.data.label}` };
    case "evaluation.completed":
      return { kind: "evaluation", label: `Score ${body.data.score}/10` };
    case "run.completed":
      return { kind: "end", label: "Run completed" };
    case "run.failed":
      return { kind: "end", label: "Run failed" };
    default:
      return null;
  }
}
