import { DEFAULT_LIMITS } from "@/harness/config";
import type { RunView } from "@/harness/view";

function Cell({ label, used, max, format }: { label: string; used: number; max: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / max) * 100);
  const hot = pct >= 85;
  const fmt = format ?? ((n: number) => String(n));
  return (
    <div className="min-w-0 space-y-1">
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
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 9px, #06080b 9px 10px)" }} />
      </div>
    </div>
  );
}

/** Docked strip under the graph, so it never covers nodes. */
export function BudgetMeter({ view }: { view: RunView }) {
  const limits = view.limits ?? DEFAULT_LIMITS;
  return (
    <div className="flex items-center gap-4 border-t border-line bg-void/60 px-3 py-2" aria-label="Research budget">
      <div className="flex w-16 shrink-0 flex-col">
        <span className="label !text-[9px] !text-ink-dim">Research budget</span>
        {view.budgetExhausted && <span className="label !text-[9px] !text-coral">exhausted</span>}
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
        <Cell label="Web search" used={view.totals.searches} max={limits.maxWebSearches} />
        <Cell label="Page fetch" used={view.totals.fetches} max={limits.maxPageFetches} />
        <Cell label="LLM calls" used={view.totals.llmCalls} max={limits.maxLlmCalls} />
        <Cell label="Cost" used={view.totals.costUsd} max={limits.maxCostUsd} format={(n) => `$${n.toFixed(2)}`} />
      </div>
    </div>
  );
}
