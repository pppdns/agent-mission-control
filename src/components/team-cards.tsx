"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { RunPreview } from "@/harness/preview";
import { PreviewGraph } from "./preview-graph";
import { layoutPreview, previewStats } from "./preview-layout";
import { ROLE_META } from "./theme";

/** Static team topologies side by side: desktop grid, swipeable snap row on phones. */
export function TeamCards({ previews }: { previews: RunPreview[] }) {
  const layouts = useMemo(() => previews.map(layoutPreview), [previews]);
  const rowRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  const onScroll = () => {
    const row = rowRef.current;
    const first = row?.firstElementChild as HTMLElement | null;
    if (!row || !first) return;
    setActive(Math.round(row.scrollLeft / (first.offsetWidth + 12)));
  };

  return (
    <>
      <ul
        ref={rowRef}
        onScroll={onScroll}
        aria-label="Featured runs"
        className="-mx-6 mt-4 flex snap-x snap-mandatory scroll-px-6 gap-3 overflow-x-auto px-6 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
      >
        {previews.map((p, i) => (
          <li key={p.runId} className="w-[85%] shrink-0 snap-start sm:w-auto">
            <Link href={`/run/${p.runId}?play=1`} className="hud group flex h-full flex-col gap-3 p-4 transition hover:border-signal/50">
              <div className="flex items-center gap-2">
                {p.taskClass && <span className="label">{p.taskClass}</span>}
                <span className="label ml-auto">
                  {p.agents.length} agents · {p.rounds} {p.rounds === 1 ? "round" : "rounds"}
                </span>
              </div>
              <span className="line-clamp-2 min-h-[2.6em] text-[14.5px] leading-snug text-ink group-hover:text-ice">{p.question || p.title}</span>
              <PreviewGraph preview={p} layout={layouts[i]} schedule={null} time={null} showLabels={false} className="mx-auto block h-36 w-full" />
              <ul className="flex flex-wrap gap-1.5" aria-label="Team">
                {p.agents
                  .filter((a) => a.role !== "orchestrator")
                  .map((a) => (
                    <li key={a.id} className="flex items-center gap-1.5 rounded-[3px] border border-line bg-panel-2 px-1.5 py-0.5 text-[11px] text-ink-dim">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: ROLE_META[a.role].color }} aria-hidden />
                      {a.name}
                    </li>
                  ))}
              </ul>
              <span className="num mt-auto text-[11px] text-ink-faint">{previewStats(p).slice(2).join(" · ")}</span>
            </Link>
          </li>
        ))}
      </ul>
      {previews.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5 sm:hidden" aria-hidden>
          {previews.map((p, i) => (
            <span key={p.runId} className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-signal" : "w-1.5 bg-line-bright"}`} />
          ))}
        </div>
      )}
    </>
  );
}
