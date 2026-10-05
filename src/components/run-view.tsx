"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentGraph } from "./agent-graph";
import { ArtifactPanel } from "./artifact-panel";
import { BudgetMeter } from "./budget-meter";
import { Inspector } from "./inspector";
import type { Selection } from "./selection";
import { formatCost, formatMs, formatTokens, Pill } from "./theme";
import { TracePanel } from "./trace-panel";
import { useRunStream } from "./use-run-stream";

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="label !text-[9.5px]">{label}</span>
      <span className="num text-[17px] leading-tight" style={{ color: tone ?? "#dce4ec" }}>
        {value}
      </span>
    </div>
  );
}

export function RunView({ runId, initialPrompt, initialStatus }: { runId: string; initialPrompt: string; initialStatus: string }) {
  const { view, status, clockSkew } = useRunStream(runId);
  const [selection, setSelection] = useState<Selection>(null);
  const [now, setNow] = useState(() => Date.now());
  const live = view.phase === "running" || view.phase === "waiting";

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const elapsed =
    view.startTs === null ? 0 : view.endTs !== null ? view.endTs - view.startTs : Math.max(0, now - clockSkew.current - view.startTs);
  const prompt = view.prompt ?? initialPrompt;
  const queued = view.phase === "waiting";

  const phaseTone =
    view.phase === "completed" ? "good" : view.phase === "failed" ? "bad" : view.phase === "declined" ? "warn" : "signal";
  const phaseLabel = queued
    ? initialStatus === "failed"
      ? "failed"
      : "queued"
    : view.phase === "running"
      ? "live"
      : view.phase;

  return (
    <div className="flex h-dvh min-h-[640px] flex-col">
      <header className="shrink-0 border-b border-line bg-panel/80 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 text-ink transition hover:text-signal" aria-label="Agent Mission Control home">
            <span className="text-signal" aria-hidden>
              ◎
            </span>
            <span className="font-display text-[15px] font-semibold uppercase tracking-[0.14em]">Mission Control</span>
          </Link>
          <div className="flex min-w-0 flex-1 basis-80 items-center gap-3">
            <Pill tone={phaseTone}>
              {view.phase === "running" && <span className="h-1.5 w-1.5 rounded-full bg-signal" style={{ animation: "blink 1s infinite" }} />}
              {phaseLabel}
            </Pill>
            <h1 className="truncate text-[14px] text-ink" title={prompt}>
              “{prompt}”
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <Metric label="Cost" value={formatCost(view.totals.costUsd)} tone="#ffb547" />
            <Metric label="Tokens" value={formatTokens(view.totals.inputTokens + view.totals.outputTokens)} />
            <Metric label="Elapsed" value={formatMs(elapsed)} />
            <Metric label="Agents" value={String(view.agentOrder.length)} />
            <Metric label="LLM calls" value={String(view.totals.llmCalls)} />
          </div>
        </div>

        {(view.classification || view.error || view.phase === "failed") && (
          <div className="flex flex-wrap items-start gap-x-4 gap-y-1 border-t border-line/70 px-4 py-2 text-[12.5px]">
            {view.classification && view.classification.taskClass !== "out_of_scope" && (
              <>
                <Pill tone="cyan">{view.classification.taskClass}</Pill>
                <span className="min-w-0 flex-1 basis-96 text-ink-dim">
                  <span className="text-ink">{view.classification.objective}</span>
                  {view.classification.reframedPrompt && (
                    <span className="ml-2 text-signal">Reframed from an out-of-scope prompt: “{view.classification.reframedPrompt}”</span>
                  )}
                </span>
              </>
            )}
            {view.classification?.taskClass === "out_of_scope" && (
              <span className="text-signal">
                The orchestrator declined this prompt without spawning agents: {view.classification.declineReason}
              </span>
            )}
            {view.phase === "failed" && <span className="text-coral">Run failed: {view.error ?? "unknown error"}</span>}
          </div>
        )}
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto p-2 lg:overflow-hidden">
        <div className="grid h-full grid-cols-1 gap-2 lg:grid-cols-[1.15fr_1fr] lg:grid-rows-[minmax(0,1fr)_14.5rem]">
          <div className="hud relative h-[30rem] min-h-0 overflow-hidden lg:h-auto">
            <div className="panel-title absolute inset-x-0 top-0 z-10 border-b-0 bg-gradient-to-b from-panel to-transparent">
              <span className="label !text-ink-dim">Agent graph</span>
              <span className="num text-[11px] text-ink-faint">
                {view.agentOrder.length} agents · {view.messages.length} messages
              </span>
              <StreamDot status={status} phase={view.phase} />
            </div>
            {view.agentOrder.length === 0 ? (
              <BootScreen phase={view.phase} status={initialStatus} />
            ) : (
              <AgentGraph view={view} selection={selection} onSelect={setSelection} />
            )}
            <div className="absolute bottom-2 left-2 z-10 hidden lg:block">
              <BudgetMeter view={view} />
            </div>
          </div>

          <div className="h-[36rem] min-h-0 lg:h-auto">
            <ArtifactPanel view={view} onSelect={setSelection} />
          </div>

          <div className="h-[20rem] min-h-0 lg:col-span-2 lg:h-auto">
            <TracePanel view={view} onSelect={setSelection} />
          </div>
        </div>

        <Inspector view={view} selection={selection} onSelect={setSelection} onClose={() => setSelection(null)} />
      </main>
    </div>
  );
}

function StreamDot({ status, phase }: { status: string; phase: string }) {
  const done = phase === "completed" || phase === "failed" || phase === "declined";
  const color = done ? "#5a6878" : status === "live" ? "#9be564" : status === "reconnecting" ? "#ffb547" : "#5a6878";
  const label = done ? "recorded" : status === "live" ? "streaming" : status;
  return (
    <span className="num ml-auto flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider" style={{ color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, animation: !done && status === "live" ? "blink 1.4s infinite" : undefined }} />
      {label}
    </span>
  );
}

function BootScreen({ phase, status }: { phase: string; status: string }) {
  const failed = status === "failed";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-full border border-line-bright" />
        <div className="absolute inset-2 rounded-full border border-dashed border-signal/50" style={{ animation: failed ? undefined : "orbit 6s linear infinite" }} />
        <div className="absolute inset-0 flex items-center justify-center text-2xl text-signal">◎</div>
      </div>
      <div>
        <div className="label !text-ink-dim">{failed ? "Run failed to start" : phase === "waiting" ? "Waiting for a worker" : "Orchestrator is planning"}</div>
        <p className="mt-1 max-w-xs text-[12.5px] text-ink-faint">
          {failed
            ? "This run could not be started."
            : "Runs wait in a queue when the demo is busy. The graph comes alive as soon as the Orchestrator spawns its team."}
        </p>
      </div>
    </div>
  );
}
