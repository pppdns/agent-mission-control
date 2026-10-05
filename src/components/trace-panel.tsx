"use client";

import { useEffect, useRef, useState } from "react";
import type { RunView, TraceItem, TraceTone } from "@/harness/view";
import type { Selection } from "./selection";
import { formatMs, ROLE_META } from "./theme";

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
};

function toSelection(item: TraceItem): Selection {
  if (!item.ref) return null;
  return item.ref.type === "agent"
    ? { type: "agent", id: item.ref.id }
    : item.ref.type === "message"
      ? { type: "message", id: item.ref.id }
      : item.ref.type === "llm"
        ? { type: "llm", id: item.ref.id }
        : item.ref.type === "tool"
          ? { type: "tool", id: item.ref.id }
          : { type: "source", id: item.ref.id };
}

export function TracePanel({ view, onSelect }: { view: RunView; onSelect: (s: Selection) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [filter, setFilter] = useState<"all" | "milestones">("all");

  const items =
    filter === "all"
      ? view.trace
      : view.trace.filter((t) => ["run", "plan", "agent", "message", "budget", "retry"].includes(t.kind));

  useEffect(() => {
    const el = scroller.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [items.length, follow]);

  return (
    <div className="hud flex h-full min-h-0 flex-col">
      <div className="panel-title">
        <span className="label !text-ink-dim">Event trace</span>
        <span className="num text-[11px] text-ink-faint">{view.trace.length} events</span>
        <div className="ml-auto flex items-center gap-1">
          {(["all", "milestones"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`label rounded-sm px-2 py-[3px] !text-[10px] transition ${filter === f ? "bg-panel-3 !text-ink" : "hover:!text-ink-dim"}`}
            >
              {f}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFollow((v) => !v)}
            className={`label rounded-sm px-2 py-[3px] !text-[10px] transition ${follow ? "!text-signal" : "hover:!text-ink-dim"}`}
            aria-pressed={follow}
          >
            {follow ? "following" : "follow"}
          </button>
        </div>
      </div>
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
          const color = agent ? ROLE_META[agent.role].color : "#8896a6";
          const selectable = !!item.ref;
          const Row = selectable ? "button" : "div";
          return (
            <Row
              key={item.seq}
              type={selectable ? "button" : undefined}
              onClick={selectable ? () => onSelect(toSelection(item)) : undefined}
              className={`anim-row grid w-full grid-cols-[3rem_7.5rem_1.1rem_1fr] items-baseline gap-x-2 px-4 py-[3px] text-left text-[12px] leading-snug ${selectable ? "hover:bg-panel-3/60" : ""}`}
            >
              <span className="num text-[10.5px] text-ink-faint">{formatMs(item.ts - (view.startTs ?? item.ts))}</span>
              <span className="truncate text-[11px]" style={{ color }}>
                {agent?.name ?? "system"}
              </span>
              <span style={{ color: TONE[item.tone] }} aria-hidden>
                {KIND_GLYPH[item.kind] ?? "·"}
              </span>
              <span className="min-w-0">
                <span className="text-ink">{item.title}</span>
                {item.detail && <span className="num ml-2 text-[11px] text-ink-faint">{item.detail}</span>}
              </span>
            </Row>
          );
        })}
      </div>
    </div>
  );
}
