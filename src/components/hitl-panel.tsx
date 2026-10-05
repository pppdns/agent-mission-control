"use client";

import { useEffect, useState, useTransition } from "react";
import type { RunView } from "@/harness/view";
import { resolveHitl } from "../../app/actions";
import { formatMs } from "./theme";

/**
 * Overlay on the graph while the run waits for a human decision. Anyone viewing a live run can answer and the
 * first answer wins; in a replay the card is read-only.
 */
export function HitlPanel({ view, runId, interactive, clockSkew }: { view: RunView; runId: string; interactive: boolean; clockSkew: number }) {
  const request = view.pendingHitl ? view.hitl[view.pendingHitl] : null;
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<{ requestId: string; optionId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request || !interactive) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [request, interactive]);

  if (!request) return null;

  const remaining = interactive ? request.deadlineTs - (now - clockSkew) : request.timeoutMs;
  const expired = interactive && remaining <= 0;
  const answered = sent?.requestId === request.requestId;
  const canAnswer = interactive && !expired && !answered && !pending;

  const choose = (optionId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await resolveHitl(runId, request.requestId, optionId);
      if (result.ok) setSent({ requestId: request.requestId, optionId });
      else setError(result.error);
    });
  };

  return (
    <div className="anim-spawn pointer-events-auto absolute inset-x-3 bottom-3 z-20 mx-auto max-w-xl rounded-[4px] border border-coral/50 bg-panel-2/95 p-3 shadow-[0_0_40px_-8px_#ff6b5a55] backdrop-blur" role="dialog" aria-label="Human decision needed">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-coral" style={{ animation: "blink 1s infinite" }} />
        <span className="label !text-[10px] !text-coral">{request.reason === "conflict" ? "Conflicting evidence" : "Budget decision"}</span>
        <span className="num ml-auto text-[11px] text-ink-dim">
          {interactive ? (expired ? "time is up" : `${formatMs(remaining)} left`) : `replay · ${formatMs(request.timeoutMs)} to answer`}
        </span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-ink">{request.question}</p>
      {request.context && <p className="mt-1 line-clamp-3 text-[12px] leading-snug text-ink-dim">{request.context}</p>}
      <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
        {request.options.map((o) => {
          const recommended = o.id === request.recommended;
          const chosen = sent?.requestId === request.requestId && sent.optionId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!canAnswer}
              onClick={() => choose(o.id)}
              className={`rounded-sm border px-2.5 py-1.5 text-left transition enabled:hover:border-signal enabled:hover:bg-signal/10 disabled:cursor-default ${
                chosen ? "border-lime/60 bg-lime/10" : recommended ? "border-signal/50 bg-signal/5" : "border-line-bright"
              } ${!canAnswer && !chosen ? "opacity-70" : ""}`}
            >
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink">
                {o.label}
                {recommended && <span className="label !text-[9px] !text-signal">recommended</span>}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{o.description}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 min-h-4 text-[11px]">
        {error ? (
          <span className="text-coral">{error}</span>
        ) : answered ? (
          <span className="text-lime">Answer sent. The team resumes in a moment.</span>
        ) : pending ? (
          <span className="text-ink-dim">Sending…</span>
        ) : interactive ? (
          <span className="text-ink-faint">The run is paused and its clock is stopped. If nobody answers, the recommended option is used.</span>
        ) : (
          <span className="text-ink-faint">Recorded run: the decision is replayed from the log.</span>
        )}
      </div>
    </div>
  );
}
