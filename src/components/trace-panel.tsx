"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RunView, TraceTone } from "@/harness/view";
import type { Selection } from "./selection";
import { formatCost, formatMs, formatTokens, ModelBadge, PROVIDER_COLOR, ROLE_META } from "./theme";

const TONE: Record<TraceTone, string> = {
  info: "#8896a6",
  good: "#9be564",
  warn: "#ffb547",
  bad: "#ff6b5a",
};

const KIND_GLYPH: Record<string, string> = {
  run: "◆",
  plan: "◈",
  agent: "●",
  message: "⇢",
  llm: "◇",
  tool: "⚙",
  artifact: "▤",
  budget: "▲",
  retry: "↻",
  note: "…",
  context: "⇲",
  evaluation: "⌖",
  loop: "⟳",
  hitl: "☺",
  checkpoint: "⛁",
  routing: "⤳",
};

const MILESTONE_KINDS = new Set(["run", "plan", "agent", "budget", "retry", "context", "evaluation", "loop", "hitl", "checkpoint", "routing"]);

type Tab = "all" | "milestones" | "routing";

export function TracePanel({ view, onSelect, onJump }: { view: RunView; onSelect: (s: Selection) => void; onJump?: (seq: number) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  const items = tab === "milestones" ? view.trace.filter((t) => MILESTONE_KINDS.has(t.kind) && !(t.kind === "agent" && t.title.endsWith("started"))) : view.trace;

  useEffect(() => {
    const el = scroller.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [items.length, follow, tab]);

  return (
    <div className="hud flex h-full min-h-0 flex-col">
      <div className="panel-title">
        <span className="label !text-ink-dim">Event trace</span>
        <span className="num text-[11px] text-ink-faint">{view.trace.length} events</span>
        <div className="ml-auto flex items-center gap-1" role="tablist">
          {(["all", "milestones", "routing"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={tab === f}
              onClick={() => setTab(f)}
              className={`label rounded-sm px-2 py-[3px] !text-[10px] transition ${tab === f ? "bg-panel-3 !text-ink" : "hover:!text-ink-dim"}`}
            >
              {f}
            </button>
          ))}
          {tab !== "routing" && (
            <button
              type="button"
              onClick={() => setFollow((v) => !v)}
              className={`label rounded-sm px-2 py-[3px] !text-[10px] transition ${follow ? "!text-signal" : "hover:!text-ink-dim"}`}
              aria-pressed={follow}
            >
              {follow ? "following" : "follow"}
            </button>
          )}
        </div>
      </div>
      {tab === "routing" ? (
        <RoutingTab view={view} onSelect={onSelect} />
      ) : (
        <div
          ref={scroller}
          onWheel={() => setFollow(false)}
          onTouchMove={() => setFollow(false)}
          className="min-h-0 flex-1 overflow-y-auto py-1"
          role="log"
          aria-live="off"
        >
          {items.length === 0 && <div className="px-4 py-6 text-center text-[13px] text-ink-faint">Waiting for the first event…</div>}
          {items.map((item) => {
            const agent = item.agentId ? view.agents[item.agentId]?.info : null;
            const color = agent ? ROLE_META[agent.role].color : item.agentId === "visitor" ? "#ff6b5a" : "#8896a6";
            const ref = item.ref;
            const stamp = formatMs(item.ts - (view.startTs ?? item.ts));
            const content = (
              <>
                <span className="truncate text-[11px]" style={{ color }}>
                  {agent?.name ?? (item.agentId === "visitor" ? "Visitor" : "system")}
                </span>
                <span style={{ color: TONE[item.tone] }} aria-hidden>
                  {KIND_GLYPH[item.kind] ?? "·"}
                </span>
                <span className="min-w-0">
                  <span className="text-ink">{item.title}</span>
                  {item.detail && <span className="num ml-2 text-[11px] text-ink-faint">{item.detail}</span>}
                </span>
              </>
            );
            return (
              <div key={item.seq} className="anim-row grid w-full grid-cols-[3rem_1fr] items-baseline gap-x-2 px-4 py-[3px] text-[12px] leading-snug hover:bg-panel-3/40">
                {onJump ? (
                  <button type="button" onClick={() => onJump(item.seq)} className="num text-left text-[10.5px] text-ink-faint transition hover:text-signal" title="Jump the replay to this moment">
                    {stamp}
                  </button>
                ) : (
                  <span className="num text-[10.5px] text-ink-faint">{stamp}</span>
                )}
                {ref ? (
                  <button type="button" onClick={() => onSelect(ref)} className="grid min-w-0 grid-cols-[7.5rem_1.1rem_1fr] items-baseline gap-x-2 text-left">
                    {content}
                  </button>
                ) : (
                  <div className="grid min-w-0 grid-cols-[7.5rem_1.1rem_1fr] items-baseline gap-x-2">{content}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoutingTab({ view, onSelect }: { view: RunView; onSelect: (s: Selection) => void }) {
  const models = useMemo(() => {
    const byModel = new Map<string, { provider: keyof typeof PROVIDER_COLOR; model: string; calls: number; input: number; output: number; cost: number; rules: Set<string> }>();
    for (const call of Object.values(view.llm)) {
      const m = byModel.get(call.model) ?? { provider: call.provider, model: call.model, calls: 0, input: 0, output: 0, cost: 0, rules: new Set<string>() };
      m.calls += 1;
      m.input += call.inputTokens;
      m.output += call.outputTokens;
      m.cost += call.costUsd;
      if (call.rule) m.rules.add(call.rule);
      byModel.set(call.model, m);
    }
    return [...byModel.values()].sort((a, b) => b.cost - a.cost);
  }, [view.llm]);

  const totalCost = models.reduce((sum, m) => sum + m.cost, 0);
  const decisions = view.routing.filter((r) => r.callId !== null || r.agentId !== null);
  const recent = decisions.slice(-60).reverse();

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-x-4 overflow-y-auto px-4 py-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <div className="label mb-1.5 !text-[9.5px]">Spend by model</div>
        {models.length === 0 && <div className="text-[12px] text-ink-faint">No LLM calls yet.</div>}
        <ul className="space-y-2">
          {models.map((m) => (
            <li key={m.model}>
              <div className="flex items-center gap-2">
                <ModelBadge provider={m.provider} model={m.model} />
                <span className="num ml-auto text-[11px] text-ink-dim">
                  {m.calls} calls · {formatTokens(m.input)}/{formatTokens(m.output)} tok · {formatCost(m.cost)}
                </span>
              </div>
              <div className="mt-1 h-[4px] overflow-hidden rounded-[1px] bg-line">
                <div className="h-full" style={{ width: `${totalCost > 0 ? (m.cost / totalCost) * 100 : 0}%`, background: PROVIDER_COLOR[m.provider] }} />
              </div>
              <div className="num mt-0.5 truncate text-[10px] text-ink-faint">{[...m.rules].join(" · ")}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        <div className="label mb-1.5 mt-3 !text-[9.5px] md:mt-0">Routing decisions ({decisions.length})</div>
        <ul className="space-y-0.5">
          {recent.map((r) => {
            const agent = r.agentId ? view.agents[r.agentId]?.info : null;
            const callId = r.callId;
            return (
              <li key={r.seq}>
                <button
                  type="button"
                  disabled={!callId && !r.agentId}
                  onClick={() => (callId ? onSelect({ type: "llm", id: callId }) : r.agentId ? onSelect({ type: "agent", id: r.agentId }) : undefined)}
                  className="grid w-full grid-cols-[6.5rem_9.5rem_1fr] items-baseline gap-x-2 rounded-sm px-1.5 py-[2px] text-left text-[11.5px] hover:bg-panel-3/60"
                >
                  <span className="truncate" style={{ color: agent ? ROLE_META[agent.role].color : "#8896a6" }}>
                    {agent?.name ?? "system"}
                  </span>
                  <span className={`num truncate text-[10.5px] ${r.rule === "escalate_large_context" || r.rule === "fallback_provider_error" ? "text-signal" : "text-ink-dim"}`}>
                    {r.rule ?? r.route}
                  </span>
                  <span className="min-w-0 truncate text-ink-faint" title={r.reason}>
                    <span className="num" style={{ color: PROVIDER_COLOR[r.provider] }}>
                      {r.model}
                    </span>{" "}
                    {callId ? "" : "(assigned) "}
                    {r.reason}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
