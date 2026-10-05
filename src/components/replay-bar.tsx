"use client";

import { useMemo } from "react";
import { milestoneOf, type MilestoneKind } from "@/harness/view";
import { formatMs } from "./theme";
import type { Player, Speed } from "./use-run-player";

export const MILESTONE_COLOR: Record<MilestoneKind, string> = {
  spawn: "#4fd1e6",
  loop: "#ffb547",
  compaction: "#c792ea",
  hitl: "#ff6b5a",
  checkpoint: "#5a6878",
  evaluation: "#9be564",
  end: "#e8f1ff",
};

const SPEEDS: Speed[] = [1, 2, 4];

/** Index of the first event whose compressed time is >= t. */
function indexAtTime(timeline: number[], t: number): number {
  let lo = 0;
  let hi = timeline.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function ReplayBar({ player }: { player: Player }) {
  const { length, cursor, mode, playing, speed, ended } = player;
  const events = player.getEvents();
  const timeline = player.getTimeline();
  const total = length > 0 ? timeline[length - 1] : 0;
  const position = cursor > 0 ? timeline[cursor - 1] : 0;
  const atLiveEdge = mode === "live" && !ended;

  const markers = useMemo(() => {
    const out: { index: number; at: number; kind: MilestoneKind; label: string; seq: number }[] = [];
    for (let i = 0; i < length; i++) {
      const m = milestoneOf(events[i]);
      if (m) out.push({ index: i + 1, at: timeline[i], seq: events[i].seq, ...m });
    }
    return out;
    // `events` and `timeline` are append-only; `length` tracks their growth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length]);

  const eventElapsed = (n: number) => (n > 0 && events[0] ? events[n - 1].ts - events[0].ts : 0);
  const pct = (at: number) => (total > 0 ? (at / total) * 100 : 0);

  if (length === 0) return null;

  return (
    <div className="flex items-center gap-3 border-t border-line bg-void/70 px-3 py-1.5" aria-label="Replay controls">
      <button
        type="button"
        onClick={playing ? player.pause : player.play}
        disabled={atLiveEdge && !playing && cursor >= length}
        className="num flex h-6 w-14 shrink-0 items-center justify-center gap-1 rounded-sm border border-line-bright text-[10.5px] uppercase tracking-wider text-ink transition hover:border-signal hover:text-signal disabled:opacity-40"
        aria-label={playing ? "Pause replay" : cursor >= length && ended ? "Replay from the start" : "Play"}
      >
        {playing ? "❚❚ Pause" : cursor >= length && ended ? "↺ Replay" : "▶ Play"}
      </button>

      <div className="flex shrink-0 overflow-hidden rounded-sm border border-line" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => player.setSpeed(s)}
            aria-pressed={speed === s}
            className={`num px-1.5 text-[10.5px] leading-6 transition ${speed === s ? "bg-signal/15 text-signal" : "text-ink-faint hover:text-ink"}`}
          >
            {s}×
          </button>
        ))}
      </div>

      <div className="relative h-6 min-w-0 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-line" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-signal/70" style={{ width: `${pct(position)}%` }} />
        {markers.map((m) => (
          <button
            key={`${m.seq}-${m.kind}`}
            type="button"
            title={m.label}
            aria-label={`Jump to: ${m.label}`}
            onClick={() => player.seek(m.index)}
            className="absolute top-0 z-10 h-6 w-[7px] -translate-x-1/2 cursor-pointer"
            style={{ left: `${pct(m.at)}%` }}
          >
            <span
              className="absolute left-1/2 top-[3px] block -translate-x-1/2 rounded-[1px]"
              style={{
                width: m.kind === "checkpoint" ? 2 : 3,
                height: m.kind === "checkpoint" ? 6 : 9,
                background: MILESTONE_COLOR[m.kind],
                opacity: m.index <= cursor ? 1 : 0.45,
              }}
            />
          </button>
        ))}
        <input
          type="range"
          min={0}
          max={Math.max(1, total)}
          step={1}
          value={position}
          onChange={(e) => player.seek(indexAtTime(timeline, Number(e.target.value)) + 1)}
          aria-label="Scrub through the run"
          className="replay-range absolute inset-x-0 bottom-0 h-3 w-full cursor-pointer"
        />
      </div>

      <span className="num shrink-0 text-[10.5px] text-ink-dim">
        {formatMs(eventElapsed(cursor))} / {formatMs(eventElapsed(length))}
      </span>

      {ended ? (
        <span className="label shrink-0 !text-[9.5px]">recorded</span>
      ) : atLiveEdge ? (
        <span className="label flex shrink-0 items-center gap-1 !text-[9.5px] !text-lime">
          <span className="h-1.5 w-1.5 rounded-full bg-lime" style={{ animation: "blink 1.4s infinite" }} />
          live
        </span>
      ) : (
        <button
          type="button"
          onClick={player.goLive}
          className="label shrink-0 rounded-sm border border-lime/40 px-1.5 !text-[9.5px] leading-5 !text-lime transition hover:bg-lime/10"
        >
          Go live ⇥
        </button>
      )}
    </div>
  );
}
