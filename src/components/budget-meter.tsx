import { DEFAULT_LIMITS } from "@/harness/config";
import type { RunView } from "@/harness/view";

function Row({ label, used, max, format }: { label: string; used: number; max: number; format?: (n: number) => string }) {
  const pct = Math.min(100, (used / max) * 100);
  const hot = pct >= 85;
  const fmt = format ?? ((n: number) => String(n));
  return (
    <div className="grid grid-cols-[6.4rem_1fr_5.2rem] items-center gap-2">
      <span className="label !text-[9.5px]">{label}</span>
      <div className="relative h-[5px] overflow-hidden rounded-[1px] bg-line">
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-500"
          style={{ width: `${pct}%`, background: hot ? "#ff6b5a" : "#ffb547" }}
        />
        <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 9px, #06080b 9px 10px)" }} />
      </div>
      <span className="num text-right text-[10.5px] text-ink-dim">
        {fmt(used)} / {fmt(max)}
      </span>
    </div>
  );
}

export function BudgetMeter({ view }: { view: RunView }) {
  const limits = view.limits ?? DEFAULT_LIMITS;
  return (
    <div className="hud w-[19.5rem] max-w-full space-y-1.5 bg-void/80 px-3 py-2.5 backdrop-blur" aria-label="Research budget">
      <div className="flex items-center justify-between">
        <span className="label !text-ink-dim">Research budget</span>
        {view.budgetExhausted && <span className="label !text-[9px] !text-coral">exhausted</span>}
      </div>
      <Row label="Web search" used={view.totals.searches} max={limits.maxWebSearches} />
      <Row label="Page fetch" used={view.totals.fetches} max={limits.maxPageFetches} />
      <Row label="LLM calls" used={view.totals.llmCalls} max={limits.maxLlmCalls} />
      <Row label="Cost" used={view.totals.costUsd} max={limits.maxCostUsd} format={(n) => `$${n.toFixed(2)}`} />
    </div>
  );
}
