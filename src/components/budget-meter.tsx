import { DEFAULT_LIMITS } from "@/harness/config";
import type { RunView } from "@/harness/view";
import { formatMs } from "./theme";

function Cell({
  label,
  used,
  max,
  format,
  title,
  reserved = 0,
}: {
  label: string;
  used: number;
  max: number;
  format?: (n: number) => string;
  title?: string;
  reserved?: number;
}) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const hot = pct >= 85;
  const fmt = format ?? ((n: number) => String(n));
  return (
    <div className="min-w-0 space-y-1" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label truncate !text-[9.5px]">{label}</span>
        <span className="num shrink-0 text-[10.5px] text-ink-dim">
          {fmt(used)} / {fmt(max)}
        </span>
      </div>
      <div className="relative h-[5px] overflow-hidden rounded-[1px] bg-line">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500"
          style={{ width: `${pct}%`, background: hot ? "#ff6b5a" : "#ffb547" }}
        />
        {reserved > 0 && max > 0 && (
          <div
            className="absolute inset-y-0 right-0 bg-cyan/40"
            style={{ width: `${Math.min(100 - pct, (reserved / max) * 100)}%` }}
          />
        )}
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 9px, #06080b 9px 10px)" }} />
      </div>
    </div>
  );
}

/** Docked strip under the graph, so it never covers nodes. */
export function BudgetMeter({ view }: { view: RunView }) {
  const limits = view.limits ?? DEFAULT_LIMITS;
  const b = view.budget;
  const allowances = b
    ? Object.entries(b.allowances)
        .map(([id, a]) => `${view.agents[id]?.info.name ?? id}: ${a.used}/${a.allowance}`)
        .join("\n")
    : "";
  return (
    <div className="flex items-center gap-4 border-t border-line bg-void/60 px-3 py-2" aria-label="Research budget">
      <div className="flex w-16 shrink-0 flex-col">
        <span className="label !text-[9px] !text-ink-dim">Research budget</span>
        {view.budgetExhausted ? (
          <span className="label !text-[9px] !text-coral" title={view.budgetExhausted}>
            exhausted
          </span>
        ) : view.budgetExtension ? (
          <span className="label !text-[9px] !text-lime" title={view.budgetExtension.reason}>
            extended
          </span>
        ) : b && b.loopReserve > 0 ? (
          <span className="label !text-[9px] !text-cyan" title="Web searches held back for a follow-up research round">
            {b.loopReserve} held
          </span>
        ) : view.round > 1 ? (
          <span className="label !text-[9px] !text-signal">round {view.round}</span>
        ) : null}
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
        <Cell
          label="Web search"
          used={b?.searches.used ?? view.totals.searches}
          max={b?.searches.limit ?? limits.maxWebSearches}
          reserved={b?.loopReserve ?? 0}
          title={allowances ? `Per-agent search allowances:\n${allowances}` : undefined}
        />
        <Cell label="Page fetch" used={b?.fetches.used ?? view.totals.fetches} max={b?.fetches.limit ?? limits.maxPageFetches} />
        <Cell label="LLM calls" used={Math.max(view.totals.llmCalls, b?.llmCalls.used ?? 0)} max={b?.llmCalls.limit ?? limits.maxLlmCalls} />
        <Cell label="Cost" used={Math.max(view.totals.costUsd, b?.costUsd.used ?? 0)} max={b?.costUsd.limit ?? limits.maxCostUsd} format={(n) => `$${n.toFixed(2)}`} />
        <Cell
          label="Time"
          used={b?.activeMs ?? 0}
          max={b?.maxRunMs ?? limits.maxRunMs}
          format={formatMs}
          title="Research time actually spent working; the clock stops while the run waits for a human decision."
        />
      </div>
    </div>
  );
}
