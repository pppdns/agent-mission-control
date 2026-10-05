"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RunEvent } from "@/harness/events";
import { applyEvent, buildView, initialView, type RunView } from "@/harness/view";

export type StreamStatus = "connecting" | "live" | "reconnecting" | "ended";
export type PlayerMode = "live" | "replay";
export type Speed = 1 | 2 | 4;

const SNAPSHOT_EVERY = 100;
/** Quiet stretches (a long LLM call, a human decision) play back at most this long at 1x. */
export const MAX_GAP_MS = 1500;
/** Events closer together than this are applied in one frame. */
const BATCH_MS = 40;

export interface Player {
  mode: PlayerMode;
  playing: boolean;
  speed: Speed;
  /** Number of events applied to the current view. */
  cursor: number;
  length: number;
  /** True once the full log is loaded and the run is terminal. */
  ended: boolean;
  /** The loaded log; changes whenever `length` does. */
  getEvents(): RunEvent[];
  /** Compressed playback time (ms) at each event, with long gaps capped. */
  getTimeline(): number[];
  play(): void;
  pause(): void;
  setSpeed(speed: Speed): void;
  seek(cursor: number): void;
  seekToSeq(seq: number): void;
  goLive(): void;
}

/**
 * One player for live runs and replays. It keeps the whole event log and a cursor: live mode follows the
 * tail as events stream in, replay mode plays the log back at event-time pace (long gaps capped). Views at
 * every 100th event are cached so scrubbing rebuilds at most 100 events.
 */
export function useRunPlayer(runId: string, opts: { autoplay?: boolean; eventsUrl?: string } = {}) {
  const logRef = useRef<RunEvent[]>([]);
  const timelineRef = useRef<number[]>([]);
  const snapsRef = useRef<RunView[]>([initialView()]);
  const tailRef = useRef<RunView>(initialView());
  const viewRef = useRef<RunView>(initialView());
  const cursorRef = useRef(0);
  const modeRef = useRef<PlayerMode>(opts.autoplay ? "replay" : "live");
  const endedRef = useRef(false);
  const skewRef = useRef(0);
  const autoplayRef = useRef(!!opts.autoplay);

  const [view, setViewState] = useState<RunView>(initialView);
  const [cursor, setCursorState] = useState(0);
  const [length, setLength] = useState(0);
  const [mode, setModeState] = useState<PlayerMode>(opts.autoplay ? "replay" : "live");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState<Speed>(1);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [ended, setEnded] = useState(false);

  const commit = useCallback((next: RunView, nextCursor: number) => {
    viewRef.current = next;
    cursorRef.current = nextCursor;
    setViewState(next);
    setCursorState(nextCursor);
  }, []);

  const setMode = useCallback((m: PlayerMode) => {
    modeRef.current = m;
    setModeState(m);
  }, []);

  /** Rebuilds the view at `target` from the nearest cached snapshot, without animations. */
  const viewAt = useCallback((target: number): RunView => {
    const log = logRef.current;
    const t = Math.max(0, Math.min(target, log.length));
    const k = Math.min(Math.floor(t / SNAPSHOT_EVERY), snapsRef.current.length - 1);
    return buildView(log.slice(k * SNAPSHOT_EVERY, t), snapsRef.current[k]);
  }, []);

  const append = useCallback(
    (events: RunEvent[]) => {
      const log = logRef.current;
      const timeline = timelineRef.current;
      let added = 0;
      for (const e of events) {
        const last = log.at(-1);
        if (last && e.seq <= last.seq) continue;
        timeline.push(last ? timeline[timeline.length - 1] + Math.min(MAX_GAP_MS, Math.max(0, e.ts - last.ts)) : 0);
        log.push(e);
        tailRef.current = applyEvent(tailRef.current, e, 0);
        if (log.length % SNAPSHOT_EVERY === 0) snapsRef.current.push(tailRef.current);
        added += 1;
      }
      if (!added) return;
      setLength(log.length);
      if (modeRef.current !== "live") return;
      // A large batch is a backlog (first load or reconnect), not live activity: skip the flight animations.
      const now = added > 40 ? 0 : Date.now();
      let next = viewRef.current;
      for (let i = cursorRef.current; i < log.length; i++) next = applyEvent(next, log[i], now);
      commit(next, log.length);
    },
    [commit],
  );

  // State is per run: callers key the component by run id. A re-subscription (Strict Mode, reconnect) replays
  // the log from the start and `append` drops events it already has.
  useEffect(() => {
    const source = new EventSource(opts.eventsUrl ?? `/api/runs/${runId}/events`);
    let buffer: RunEvent[] = [];
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const events = buffer;
      buffer = [];
      append(events);
    };

    source.onopen = () => setStatus("live");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      skewRef.current = Date.now() - event.ts;
      buffer.push(event);
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    source.addEventListener("end", () => {
      if (frame !== null) cancelAnimationFrame(frame);
      flush();
      endedRef.current = true;
      setEnded(true);
      setStatus("ended");
      source.close();
      if (autoplayRef.current) {
        autoplayRef.current = false;
        setPlaying(true);
      }
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setStatus("ended");
      else setStatus("reconnecting");
    };

    return () => {
      source.close();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [runId, opts.eventsUrl, append]);

  // Playback loop: applies events at their recorded pace, scaled by speed, with long gaps capped.
  useEffect(() => {
    if (!playing || mode !== "replay") return;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const log = logRef.current;
      let c = cursorRef.current;
      if (c >= log.length) {
        setPlaying(false);
        if (!endedRef.current) setMode("live");
        return;
      }
      const now = Date.now();
      const start = log[c].ts;
      let next = viewRef.current;
      do {
        next = applyEvent(next, log[c], now);
        c += 1;
      } while (c < log.length && log[c].ts - start < BATCH_MS * speed);
      commit(next, c);
      if (c >= log.length) {
        setPlaying(false);
        if (!endedRef.current) setMode("live");
        return;
      }
      const gap = Math.min(MAX_GAP_MS, Math.max(0, log[c].ts - log[c - 1].ts)) / speed;
      timer = setTimeout(step, Math.max(16, gap));
    };
    timer = setTimeout(step, 0);
    return () => clearTimeout(timer);
  }, [playing, mode, speed, commit, setMode]);

  const seek = useCallback(
    (target: number) => {
      const t = Math.max(0, Math.min(Math.round(target), logRef.current.length));
      if (t >= logRef.current.length && !endedRef.current) {
        setPlaying(false);
        setMode("live");
        commit(viewAt(t), t);
        return;
      }
      setMode("replay");
      commit(viewAt(t), t);
    },
    [commit, setMode, viewAt],
  );

  const seekToSeq = useCallback(
    (seq: number) => {
      const log = logRef.current;
      let lo = 0;
      let hi = log.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (log[mid].seq <= seq) lo = mid + 1;
        else hi = mid;
      }
      setPlaying(false);
      seek(lo);
    },
    [seek],
  );

  const play = useCallback(() => {
    if (cursorRef.current >= logRef.current.length) {
      if (!endedRef.current) return;
      setMode("replay");
      commit(initialView(), 0);
    } else {
      setMode("replay");
    }
    setPlaying(true);
  }, [commit, setMode]);

  const pause = useCallback(() => {
    setPlaying(false);
    if (modeRef.current === "live") setMode("replay");
  }, [setMode]);

  const goLive = useCallback(() => {
    setPlaying(false);
    setMode("live");
    commit(viewAt(logRef.current.length), logRef.current.length);
  }, [commit, setMode, viewAt]);

  const getEvents = useCallback(() => logRef.current, []);
  const getTimeline = useCallback(() => timelineRef.current, []);

  const player: Player = {
    mode,
    playing,
    speed,
    cursor,
    length,
    ended,
    getEvents,
    getTimeline,
    play,
    pause,
    setSpeed: setSpeedState,
    seek,
    seekToSeq,
    goLive,
  };

  return { view, status, clockSkew: skewRef, player };
}
