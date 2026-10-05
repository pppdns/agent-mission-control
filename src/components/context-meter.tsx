import type { ContextCategory } from "@/harness/types";
import { CONTEXT_CATEGORIES } from "@/harness/types";
import type { AgentView, ContextView } from "@/harness/view";
import { formatTokens } from "./theme";

export const CATEGORY_META: Record<ContextCategory, { label: string; color: string }> = {
  system: { label: "System + rules", color: "#5a6878" },
  workingState: { label: "Working state", color: "#ffb547" },
  recentTurns: { label: "Recent turns", color: "#4fd1e6" },
  toolResults: { label: "Tool results", color: "#9be564" },
  retrieved: { label: "Retrieved evidence", color: "#c792ea" },
};

function Segments({ context, height }: { context: ContextView; height: number }) {
  const { budget } = context;
  const usable = budget.windowTokens - budget.reservedOutputTokens;
  const pct = (n: number) => `${Math.max(0, (n / budget.windowTokens) * 100)}%`;
  return (
    <div className="relative overflow-hidden rounded-[1px] bg-line" style={{ height }}>
      <div className="absolute inset-y-0 left-0 flex" style={{ width: pct(Math.min(context.total, budget.windowTokens)) }}>
        {CONTEXT_CATEGORIES.map((c) =>
          context.tokens[c] > 0 ? (
            <div key={c} className="h-full transition-[flex-grow] duration-500" style={{ flexGrow: context.tokens[c], background: CATEGORY_META[c].color }} />
          ) : null,
        )}
      </div>
      <div className="absolute inset-y-0 right-0 bg-void/70" style={{ width: pct(budget.reservedOutputTokens), backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, #2b3a49 3px 4px)" }} />
      <div className="absolute inset-y-0 w-px bg-coral" style={{ left: pct(budget.compactAtTokens) }} title="Compaction threshold" />
      <div className="absolute inset-y-0 w-px bg-ink-faint/60" style={{ left: pct(usable) }} />
    </div>
  );
}

/** Thin bar for graph nodes: how full the agent's last prompt was, against its compaction threshold. */
export function MiniContextMeter({ context }: { context: ContextView | null }) {
  if (!context) return <div className="h-[3px] rounded-[1px] bg-line/60" />;
  return <Segments context={context} height={3} />;
}

function Sparkline({ history, window }: { history: AgentView["contextHistory"]; window: number }) {
  if (history.length < 2) return null;
  const w = 240;
  const h = 34;
  const x = (i: number) => (i / (history.length - 1)) * w;
  const y = (t: number) => h - Math.min(1, t / window) * h;
  const d = history.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-9 w-full" preserveAspectRatio="none" aria-label="Context size over time">
      <path d={d} fill="none" stroke="#4fd1e6" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      {history.map((p, i) => (p.compacted ? <circle key={i} cx={x(i)} cy={y(p.total)} r={2.6} fill="#c792ea" /> : null))}
    </svg>
  );
}

export function ContextMeter({ agent }: { agent: AgentView }) {
  const context = agent.context;
  if (!context) {
    return <div className="text-[12px] text-ink-faint">No prompt measured yet.</div>;
  }
  const { budget } = context;
  const full = context.total / budget.compactAtTokens;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11.5px]">
        <span className="num text-ink">
          {formatTokens(context.total)} <span className="text-ink-faint">/ {formatTokens(budget.windowTokens)} tokens</span>
        </span>
        <span className="num text-[10.5px]" style={{ color: full >= 1 ? "#ff6b5a" : full >= 0.8 ? "#ffb547" : "#8896a6" }}>
          {Math.round(full * 100)}% of compaction threshold
        </span>
      </div>
      <Segments context={context} height={8} />
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
        {CONTEXT_CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-[1px]" style={{ background: CATEGORY_META[c].color }} />
            <span className="truncate text-ink-dim">{CATEGORY_META[c].label}</span>
            <span className="num ml-auto text-ink-faint">{formatTokens(context.tokens[c])}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10.5px] text-ink-faint">
        Compacts at {formatTokens(budget.compactAtTokens)} · {formatTokens(budget.reservedOutputTokens)} reserved for output · last measured for “{context.purpose}”
      </div>
      <Sparkline history={agent.contextHistory} window={budget.windowTokens} />
    </div>
  );
}
