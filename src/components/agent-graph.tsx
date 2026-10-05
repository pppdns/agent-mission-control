"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { memo, useEffect, useMemo, useState } from "react";
import type { MessageType } from "@/harness/types";
import type { AgentView, RunView } from "@/harness/view";
import { MiniContextMeter } from "./context-meter";
import type { Selection } from "./selection";
import { formatCost, formatTokens, ModelBadge, ROLE_META } from "./theme";

const FRESH_MS = 2600;
const NODE_W = 176;
const NODE_H = 112;
const MCP_W = 150;
const VISITOR_W = 132;
const VISITOR_ID = "visitor";
const HITL_COLOR = "#ff6b5a";
/** Above every edge, so an edge that spans a row never swallows clicks on the nodes it crosses. */
const NODE_Z = 10;

const MESSAGE_COLOR: Record<MessageType, string> = {
  finding: "#4fd1e6",
  claim: "#4fd1e6",
  evidence: "#9be564",
  objection: "#ff6b5a",
  question: "#ffb547",
  request: "#ffb547",
  delegation: "#b9c7d8",
  review: "#9be564",
  revision: "#ffb547",
  decision: "#ffb547",
};

type AgentNodeData = {
  agent: AgentView;
  selected: boolean;
  retryFlash: boolean;
  compactFlash: boolean;
};
type McpNodeData = { server: string; tools: string[]; calls: number; inFlight: number };
type VisitorNodeData = { waiting: boolean; answered: number; selected: boolean };

function SideHandles() {
  const sides: [Position, string][] = [
    [Position.Top, "top"],
    [Position.Bottom, "bottom"],
    [Position.Left, "left"],
    [Position.Right, "right"],
  ];
  return (
    <>
      {sides.map(([position, id]) => (
        <span key={id}>
          <Handle type="source" position={position} id={`s-${id}`} />
          <Handle type="target" position={position} id={`t-${id}`} />
        </span>
      ))}
    </>
  );
}

const STATUS_STYLE: Record<AgentView["status"], { dot: string; label: string }> = {
  spawned: { dot: "#5a6878", label: "standby" },
  running: { dot: "#ffb547", label: "working" },
  completed: { dot: "#9be564", label: "done" },
  failed: { dot: "#ff6b5a", label: "failed" },
};

const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const { agent, selected, retryFlash, compactFlash } = data;
  const meta = ROLE_META[agent.info.role];
  const busy = agent.llmInFlight > 0 || agent.toolsInFlight > 0;
  const status = STATUS_STYLE[agent.status];
  return (
    <div className="anim-spawn">
    <div
      className={`relative cursor-pointer rounded-[4px] border bg-panel-2/95 px-3 py-2.5 backdrop-blur ${compactFlash ? "anim-squeeze" : ""}`}
      style={{
        width: NODE_W,
        height: NODE_H,
        borderColor: selected ? meta.color : `${meta.color}55`,
        boxShadow: selected ? `0 0 0 1px ${meta.color}, 0 0 28px ${meta.color}33` : busy ? `0 0 22px ${meta.color}22` : "none",
        ["--ring" as string]: `${meta.color}88`,
        animation: busy ? "pulse-ring 1.4s ease-out infinite" : undefined,
      }}
    >
      <SideHandles />
      <div className="absolute -top-2 right-2 flex gap-1">
        {agent.round > 1 && agent.info.role !== "orchestrator" && agent.info.role !== "editor" && (
          <span key={`r${agent.round}`} className="anim-badge num rounded-sm border border-signal/60 bg-void px-1 text-[9px] leading-[14px] text-signal" title={`Working on research round ${agent.round}`}>
            R{agent.round}
          </span>
        )}
        {retryFlash && (
          <span className="anim-badge num rounded-sm border border-signal/60 bg-void px-1 text-[9px] leading-[14px] text-signal" title="Retrying after an error">
            ↻ retry
          </span>
        )}
        {compactFlash && (
          <span className="anim-badge num rounded-sm border border-[#c792ea88] bg-void px-1 text-[9px] leading-[14px] text-[#c792ea]" title="Compacting its context window">
            ⇲ compact
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium" style={{ color: meta.color }}>
          <span aria-hidden className="text-sm">
            {meta.glyph}
          </span>
          <span className="truncate">{agent.info.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[9.5px] uppercase tracking-wider text-ink-faint">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: status.dot, animation: agent.status === "running" ? "blink 1.1s infinite" : undefined }}
          />
          {status.label}
        </span>
      </div>
      <div className="mt-1.5">
        <ModelBadge provider={agent.info.provider} model={agent.info.model} />
      </div>
      <div className="num mt-1.5 h-4 truncate text-[10.5px] text-ink-dim">
        {agent.activity ? <span className="text-signal">▸ {agent.activity}</span> : agent.status === "completed" ? agent.summary : "—"}
      </div>
      <div className="num mt-1 flex items-center gap-2 overflow-hidden whitespace-nowrap text-[10px] text-ink-faint">
        <span>{formatTokens(agent.inputTokens + agent.outputTokens)} tok</span>
        <span>{formatCost(agent.costUsd)}</span>
        <span>{agent.llmCalls} calls</span>
        {agent.compactions > 0 && <span className="text-[#c792ea]">⇲{agent.compactions}</span>}
      </div>
      <div className="mt-1.5" title={agent.context ? `Context: ${agent.context.total.toLocaleString()} of ${agent.context.budget.compactAtTokens.toLocaleString()} tokens before compaction` : "Context not measured yet"}>
        <MiniContextMeter context={agent.context} />
      </div>
      {busy && <div className="shimmer-line absolute inset-x-0 bottom-0 h-[2px]" />}
    </div>
    </div>
  );
});

const VisitorNode = memo(function VisitorNode({ data }: NodeProps<Node<VisitorNodeData>>) {
  const color = data.waiting ? HITL_COLOR : "#8896a6";
  return (
    <div className="anim-spawn">
      <div
        className="cursor-pointer rounded-full border px-3 py-2 text-center"
        style={{
          width: VISITOR_W,
          borderColor: data.selected ? color : `${color}88`,
          background: "#0b1016ee",
          boxShadow: data.waiting ? `0 0 26px ${HITL_COLOR}44` : "none",
          ["--ring" as string]: `${HITL_COLOR}88`,
          animation: data.waiting ? "pulse-ring 1.4s ease-out infinite" : undefined,
        }}
      >
        <SideHandles />
        <div className="text-[12.5px] font-medium" style={{ color }}>
          ☺ Visitor
        </div>
        <div className="num text-[10px] text-ink-faint">{data.waiting ? "decision needed" : `${data.answered} decision${data.answered === 1 ? "" : "s"}`}</div>
      </div>
    </div>
  );
});

const McpNode = memo(function McpNode({ data }: NodeProps<Node<McpNodeData>>) {
  const active = data.inFlight > 0;
  return (
    <div
      className="rounded-[4px] border border-dashed bg-panel/90 px-3 py-2 text-center"
      style={{ width: MCP_W, borderColor: active ? "#ffb547" : "#2b3a49", boxShadow: active ? "0 0 20px #ffb54722" : "none" }}
    >
      <SideHandles />
      <div className="label !text-[9px]">MCP server</div>
      <div className="mt-0.5 text-[12.5px] font-medium capitalize text-ink">{data.server}</div>
      <div className="num mt-0.5 text-[10px] text-ink-faint">{data.tools.join(" · ")}</div>
      <div className="num mt-1 text-[10px]" style={{ color: active ? "#ffb547" : "#8896a6" }}>
        {data.calls} calls{active ? " · live" : ""}
      </div>
    </div>
  );
});

interface FlowDot {
  id: string;
  reverse: boolean;
  color: string;
}
type LinkEdgeData = {
  color: string;
  dots: FlowDot[];
  label: string | null;
  dashed: boolean;
  flowing: boolean;
  selected: boolean;
  count: number;
};

const LinkEdge = memo(function LinkEdge(props: EdgeProps<Edge<LinkEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  if (!data) return null;
  return (
    <>
      <BaseEdge
        path={path}
        interactionWidth={22}
        style={{
          stroke: data.selected ? data.color : `${data.color}${data.dashed ? "66" : "88"}`,
          strokeWidth: data.selected ? 2.4 : data.dots.length > 0 ? 2 : 1.4,
          strokeDasharray: data.dashed || data.flowing ? "6 6" : undefined,
          animation: data.flowing ? "dash-flow 0.7s linear infinite" : undefined,
        }}
      />
      {data.dots.map((dot) => (
        <circle key={dot.id} r={4.5} fill={dot.color} style={{ filter: `drop-shadow(0 0 6px ${dot.color})` }}>
          <animateMotion
            dur="1.2s"
            repeatCount="1"
            fill="freeze"
            path={path}
            keyPoints={dot.reverse ? "1;0" : "0;1"}
            keyTimes="0;1"
            calcMode="linear"
          />
        </circle>
      ))}
      {data.label && (
        <EdgeLabelRenderer>
          <div
            className="num pointer-events-none absolute rounded-sm border px-1.5 py-[1px] text-[9.5px] uppercase tracking-wider"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: data.color,
              borderColor: `${data.color}66`,
              background: "#06080bdd",
            }}
          >
            {data.label}
            {data.count > 1 ? ` ×${data.count}` : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

const nodeTypes = { agent: AgentNode, mcp: McpNode, visitor: VisitorNode };
const edgeTypes = { link: LinkEdge };

function layout(view: RunView) {
  const positions: Record<string, { x: number; y: number }> = {};
  const workers = view.agentOrder.filter((id) => {
    const role = view.agents[id].info.role;
    return role !== "orchestrator" && role !== "editor" && role !== "evaluator";
  });
  const gap = NODE_W + 34;
  const rowWidth = Math.max(0, workers.length - 1) * gap;
  const origin = -rowWidth / 2;
  workers.forEach((id, i) => {
    positions[id] = { x: origin + i * gap - NODE_W / 2, y: 150 };
  });
  for (const id of view.agentOrder) {
    const role = view.agents[id].info.role;
    if (role === "orchestrator") positions[id] = { x: -NODE_W / 2, y: 0 };
    if (role === "evaluator") positions[id] = { x: NODE_W / 2 + 70, y: 0 };
    if (role === "editor") positions[id] = { x: -NODE_W / 2, y: 424 };
  }
  if (view.hitlOrder.length > 0) positions[VISITOR_ID] = { x: -NODE_W / 2 - 70 - VISITOR_W, y: 30 };
  const servers = [...new Set(view.tools.map((t) => t.server).filter((s): s is string => !!s))];
  const mcpGap = 28;
  const mcpWidth = servers.length * MCP_W + Math.max(0, servers.length - 1) * mcpGap;
  servers.forEach((server, i) => {
    positions[`mcp:${server}`] = { x: -mcpWidth / 2 + i * (MCP_W + mcpGap), y: 300 };
  });
  return positions;
}

function handlesFor(a: { x: number; y: number }, aw: number, b: { x: number; y: number }, bw: number) {
  const dx = b.x + bw / 2 - (a.x + aw / 2);
  const dy = b.y - a.y;
  if (Math.abs(dy) > 60) {
    return dy > 0 ? { s: "s-bottom", t: "t-top" } : { s: "s-top", t: "t-bottom" };
  }
  return dx > 0 ? { s: "s-right", t: "t-left" } : { s: "s-left", t: "t-right" };
}

function GraphInner({ view, selection, onSelect }: { view: RunView; selection: Selection; onSelect: (s: Selection) => void }) {
  const flow = useReactFlow();
  const [wallNow, setWallNow] = useState(() => Date.now());
  const terminal = view.phase === "completed" || view.phase === "failed" || view.phase === "declined";
  const latestArrival = useMemo(() => {
    let latest = 0;
    for (const m of view.messages) latest = Math.max(latest, m.arrivedAt);
    for (const t of Object.values(view.toolCalls)) latest = Math.max(latest, t.arrivedAt, t.settledAt ?? 0);
    for (const a of Object.values(view.agents)) latest = Math.max(latest, a.lastRetryAt ?? 0, a.lastCompactionAt ?? 0);
    return latest;
  }, [view.messages, view.toolCalls, view.agents]);

  useEffect(() => {
    const timer = setInterval(() => {
      const n = Date.now();
      setWallNow(n);
      if (terminal && n - latestArrival > FRESH_MS + 1500) clearInterval(timer);
    }, 450);
    return () => clearInterval(timer);
  }, [terminal, latestArrival]);

  const positions = useMemo(() => layout(view), [view]);

  const nodes = useMemo(() => {
    const list: Node[] = [];
    for (const id of view.agentOrder) {
      const agent = view.agents[id];
      list.push({
        id,
        type: "agent",
        initialWidth: NODE_W,
        initialHeight: NODE_H,
        position: positions[id],
        draggable: false,
        zIndex: NODE_Z,
        data: {
          agent,
          selected: selection?.type === "agent" && selection.id === id,
          retryFlash: !!agent.lastRetryAt && wallNow - agent.lastRetryAt < FRESH_MS,
          compactFlash: !!agent.lastCompactionAt && (wallNow - agent.lastCompactionAt < FRESH_MS || agent.activity?.startsWith("compacting") === true),
        } satisfies AgentNodeData,
      });
    }
    if (positions[VISITOR_ID]) {
      list.push({
        id: VISITOR_ID,
        type: "visitor",
        initialWidth: VISITOR_W,
        initialHeight: 48,
        position: positions[VISITOR_ID],
        draggable: false,
        zIndex: NODE_Z,
        data: {
          waiting: view.pendingHitl !== null,
          answered: view.hitlOrder.filter((id) => view.hitl[id].status === "resolved").length,
          selected: selection?.type === "hitl",
        } satisfies VisitorNodeData,
      });
    }
    const servers = [...new Set(view.tools.map((t) => t.server).filter((s): s is string => !!s))];
    for (const server of servers) {
      const calls = Object.values(view.toolCalls).filter((t) => t.server === server);
      list.push({
        id: `mcp:${server}`,
        type: "mcp",
        initialWidth: MCP_W,
        initialHeight: 64,
        position: positions[`mcp:${server}`],
        draggable: false,
        zIndex: NODE_Z,
        data: {
          server,
          tools: view.tools.filter((t) => t.server === server).map((t) => t.mcpTool ?? t.name),
          calls: calls.length,
          inFlight: calls.filter((t) => t.status === "running" || t.status === "retrying").length,
        } satisfies McpNodeData,
      });
    }
    return list;
  }, [view, positions, selection, wallNow]);

  const edges = useMemo(() => {
    const out: Edge[] = [];
    const size = (id: string) => (id.startsWith("mcp:") ? MCP_W : id === VISITOR_ID ? VISITOR_W : NODE_W);

    const orchestrator = view.agentOrder.find((id) => view.agents[id].info.role === "orchestrator");
    if (positions[VISITOR_ID] && orchestrator && positions[orchestrator]) {
      const waiting = view.pendingHitl !== null;
      const latest = view.hitl[view.hitlOrder[view.hitlOrder.length - 1]];
      out.push({
        id: `hitl:${orchestrator}`,
        source: orchestrator,
        target: VISITOR_ID,
        sourceHandle: "s-left",
        targetHandle: "t-right",
        type: "link",
        data: {
          color: HITL_COLOR,
          count: view.hitlOrder.length,
          label: waiting ? "decision?" : latest?.resolvedBy === "timeout" ? "timed out" : "answered",
          dots: [],
          dashed: !waiting,
          flowing: waiting,
          selected: selection?.type === "hitl",
        } satisfies LinkEdgeData,
        zIndex: 2,
      });
    }

    const pairs = new Map<string, typeof view.messages>();
    for (const m of view.messages) {
      const { from, to } = m.message;
      if (!positions[from] || !positions[to]) continue;
      const key = [from, to].sort().join("|");
      pairs.set(key, [...(pairs.get(key) ?? []), m]);
    }
    for (const [key, list] of pairs) {
      const first = list[0].message;
      const a = positions[first.from];
      const b = positions[first.to];
      const h = handlesFor(a, size(first.from), b, size(first.to));
      const last = list[list.length - 1];
      const color = MESSAGE_COLOR[last.message.type];
      const fresh = list.filter((m) => wallNow - m.arrivedAt < FRESH_MS);
      const [x, y] = key.split("|");
      out.push({
        id: `msg:${key}`,
        source: first.from,
        target: first.to,
        sourceHandle: h.s,
        targetHandle: h.t,
        type: "link",
        data: {
          color,
          count: list.length,
          label: fresh.length > 0 ? last.message.type : null,
          dots: fresh.slice(-3).map((m) => ({ id: m.message.id, reverse: m.message.from !== first.from, color: MESSAGE_COLOR[m.message.type] })),
          dashed: false,
          flowing: false,
          selected: selection?.type === "pair" && [selection.a, selection.b].sort().join("|") === key,
        } satisfies LinkEdgeData,
        zIndex: fresh.length > 0 ? 2 : 1,
        selectable: true,
        ariaLabel: `Messages between ${x} and ${y}`,
      });
    }

    const toolPairs = new Map<string, { agentId: string; server: string; calls: (typeof view.toolCalls)[string][] }>();
    for (const t of Object.values(view.toolCalls)) {
      if (!t.server || !positions[t.agentId]) continue;
      const key = `${t.agentId}|${t.server}`;
      const entry = toolPairs.get(key) ?? { agentId: t.agentId, server: t.server, calls: [] };
      entry.calls.push(t);
      toolPairs.set(key, entry);
    }
    for (const [key, { agentId, server, calls }] of toolPairs) {
      const target = `mcp:${server}`;
      if (!positions[target]) continue;
      const h = handlesFor(positions[agentId], NODE_W, positions[target], MCP_W);
      const dots: FlowDot[] = [];
      for (const c of calls) {
        if (wallNow - c.arrivedAt < FRESH_MS) dots.push({ id: `${c.toolCallId}:req`, reverse: false, color: "#ffb547" });
        if (c.settledAt && wallNow - c.settledAt < FRESH_MS) {
          dots.push({ id: `${c.toolCallId}:res`, reverse: true, color: c.status === "done" ? "#9be564" : "#ff6b5a" });
        }
      }
      const inFlight = calls.some((c) => c.status === "running" || c.status === "retrying");
      out.push({
        id: `tool:${key}`,
        source: agentId,
        target,
        sourceHandle: h.s,
        targetHandle: h.t,
        type: "link",
        data: {
          color: "#ffb547",
          dots: dots.slice(-4),
          label: null,
          dashed: true,
          flowing: inFlight,
          selected: selection?.type === "tool" && calls.some((c) => c.toolCallId === selection.id),
          count: calls.length,
        } satisfies LinkEdgeData,
        zIndex: dots.length ? 2 : 0,
      });
    }
    return out;
  }, [view, positions, selection, wallNow]);

  const count = nodes.length;
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.1, duration: 650, maxZoom: 1.15 }), 60);
    return () => clearTimeout(t);
  }, [count, flow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      zoomOnScroll={false}
      panOnScroll={false}
      minZoom={0.35}
      maxZoom={1.4}
      onNodeClick={(_, node) => {
        if (node.id === VISITOR_ID) {
          const id = view.pendingHitl ?? view.hitlOrder[view.hitlOrder.length - 1];
          if (id) onSelect({ type: "hitl", id });
        } else if (!node.id.startsWith("mcp:")) onSelect({ type: "agent", id: node.id });
      }}
      onEdgeClick={(_, edge) => {
        if (edge.id.startsWith("msg:")) {
          const [a, b] = edge.id.slice(4).split("|");
          onSelect({ type: "pair", a, b });
        } else if (edge.id.startsWith("tool:")) {
          const [agentId, server] = edge.id.slice(5).split("|");
          let latest: (typeof view.toolCalls)[string] | null = null;
          for (const t of Object.values(view.toolCalls)) {
            if (t.agentId === agentId && t.server === server && (!latest || t.requestedTs >= latest.requestedTs)) latest = t;
          }
          if (latest) onSelect({ type: "tool", id: latest.toolCallId });
        } else if (edge.id.startsWith("hitl:")) {
          const id = view.pendingHitl ?? view.hitlOrder[view.hitlOrder.length - 1];
          if (id) onSelect({ type: "hitl", id });
        }
      }}
      onPaneClick={() => onSelect(null)}
    />
  );
}

export function AgentGraph(props: { view: RunView; selection: Selection; onSelect: (s: Selection) => void }) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}
