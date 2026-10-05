import type { EventBody, RunEvent, ToolManifestEntry } from "./events";
import type {
  AgentInfo,
  AgentMessage,
  AgentStatus,
  Artifact,
  Limits,
  Provider,
  RouteName,
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

export type RunPhase = "waiting" | "running" | "completed" | "failed" | "declined";

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
}

export interface LlmView {
  callId: string;
  agentId: string;
  purpose: string;
  provider: Provider;
  model: string;
  route: RouteName;
  step: number | null;
  messageCount: number;
  promptChars: number;
  requestedTs: number;
  streamedChars: number;
  status: "running" | "done" | "failed";
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

export type TraceTone = "info" | "good" | "warn" | "bad";
export type TraceRef =
  | { type: "agent"; id: string }
  | { type: "message"; id: string }
  | { type: "llm"; id: string }
  | { type: "tool"; id: string }
  | { type: "source"; id: string };

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
      s.finalTotals = body.data.totals;
      s.totals = { ...s.totals, ...body.data.totals };
      return trace(s, e, { kind: "run", title: "Run completed", detail: `${(body.data.durationMs / 1000).toFixed(1)}s`, tone: "good", ref: null });

    case "run.failed":
      s.phase = "failed";
      s.endTs = e.ts;
      s.error = body.data.error;
      s.finalTotals = body.data.totals;
      return trace(s, e, { kind: "run", title: "Run failed", detail: body.data.error, tone: "bad", ref: null });

    case "budget.exhausted":
      s.budgetExhausted = body.data.reason;
      return trace(s, e, { kind: "budget", title: "Budget exhausted → synthesizing", detail: body.data.reason, tone: "warn", ref: null });

    case "routing.decided":
      return s;

    case "agent.spawned": {
      const info = body.data.agent;
      s.agents = {
        ...s.agents,
        [info.id]: {
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
        },
      };
      s.agentOrder = [...s.agentOrder, info.id];
      s.totals = { ...s.totals, agents: s.agentOrder.length };
      return trace(s, e, {
        kind: "agent",
        agentId: info.id,
        title: `Spawned ${info.name}`,
        detail: `${info.model} · route ${info.route}`,
        tone: "info",
        ref: { type: "agent", id: info.id },
      });
    }

    case "agent.started":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "running", startedTs: e.ts, activity: "starting" }));
      return trace(s, e, { kind: "agent", title: `${s.agents[e.agentId ?? ""]?.info.name ?? "Agent"} started`, detail: null, tone: "info", ref: e.agentId ? { type: "agent", id: e.agentId } : null });

    case "agent.note":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, notes: [...a.notes, body.data.text] }));
      return trace(s, e, { kind: "note", title: "Note", detail: clipText(body.data.text, 220), tone: "info", ref: e.agentId ? { type: "agent", id: e.agentId } : null });

    case "agent.message_sent": {
      const m = body.data.message;
      s.messages = [...s.messages, { message: m, seq: e.seq, ts: e.ts, arrivedAt: now }];
      const from = s.agents[m.from]?.info.name ?? m.from;
      const to = s.agents[m.to]?.info.name ?? m.to;
      return trace(s, e, {
        kind: "message",
        agentId: m.from,
        title: `${from} → ${to} · ${m.type}`,
        detail: clipText(m.content, 200),
        tone: m.type === "objection" ? "warn" : "info",
        ref: { type: "message", id: m.id },
      });
    }

    case "agent.retrying":
      return trace(s, e, {
        kind: "retry",
        title: body.data.fallbackModel ? `Falling back to ${body.data.fallbackModel}` : "Retrying",
        detail: body.data.reason,
        tone: "warn",
        ref: e.agentId ? { type: "agent", id: e.agentId } : null,
      });

    case "agent.completed":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "completed", report: body.data.report, summary: body.data.summary, endedTs: e.ts, activity: null }));
      return trace(s, e, {
        kind: "agent",
        title: `${s.agents[e.agentId ?? ""]?.info.name ?? "Agent"} completed`,
        detail: body.data.summary,
        tone: "good",
        ref: e.agentId ? { type: "agent", id: e.agentId } : null,
      });

    case "agent.failed":
      s = patchAgent(s, e.agentId, (a) => ({ ...a, status: "failed", error: body.data.error, endedTs: e.ts, activity: null }));
      return trace(s, e, { kind: "agent", title: `${s.agents[e.agentId ?? ""]?.info.name ?? "Agent"} failed`, detail: body.data.error, tone: "bad", ref: e.agentId ? { type: "agent", id: e.agentId } : null });

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
        // A provider fallback changes the model actually serving this agent; the badge follows it.
        info: a.info.model === d.model ? a.info : { ...a.info, provider: d.provider, model: d.model },
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
        const manifest = s.tools.find((m) => m.name === d.tool);
        if (manifest?.budget === "search") s.totals = { ...s.totals, searches: s.totals.searches + 1 };
        if (manifest?.budget === "fetch") s.totals = { ...s.totals, fetches: s.totals.fetches + 1 };
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
      s.sources = { ...s.sources, [src.id]: src };
      s.sourceOrder = [...s.sourceOrder, src.id];
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
  }
  return s;
}

export function buildView(events: RunEvent[]): RunView {
  return events.reduce((view, e) => applyEvent(view, e, 0), initialView());
}

export function elapsedMs(view: RunView, nowOffset: number): number {
  if (view.startTs === null) return 0;
  if (view.endTs !== null) return view.endTs - view.startTs;
  return view.lastTs - view.startTs + nowOffset;
}
