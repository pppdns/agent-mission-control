"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import type { RunEvent } from "@/harness/events";
import { applyEvent, initialView, type RunView } from "@/harness/view";

type Action = { type: "events"; events: RunEvent[]; now: number } | { type: "reset" };

function reducer(state: RunView, action: Action): RunView {
  if (action.type === "reset") return initialView();
  let next = state;
  for (const event of action.events) next = applyEvent(next, event, action.now);
  return next;
}

export type StreamStatus = "connecting" | "live" | "reconnecting" | "ended";

/**
 * Follows /api/runs/[id]/events. Events are batched per animation frame so a replayed backlog
 * of hundreds of events renders as one update. EventSource reconnects resume from Last-Event-ID.
 */
export function useRunStream(runId: string) {
  const [view, dispatch] = useReducer(reducer, undefined, initialView);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const bufferRef = useRef<RunEvent[]>([]);
  const frameRef = useRef<number | null>(null);
  const skewRef = useRef(0);

  useEffect(() => {
    dispatch({ type: "reset" });
    const source = new EventSource(`/api/runs/${runId}/events`);

    const flush = () => {
      frameRef.current = null;
      const events = bufferRef.current;
      bufferRef.current = [];
      // A large first batch is a backlog (replay or reconnect), not live activity: skip the flight animations.
      if (events.length > 0) dispatch({ type: "events", events, now: events.length > 40 ? 0 : Date.now() });
    };

    source.onopen = () => setStatus("live");
    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as RunEvent;
      skewRef.current = Date.now() - event.ts;
      bufferRef.current.push(event);
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(flush);
    };
    source.addEventListener("end", () => {
      flush();
      setStatus("ended");
      source.close();
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setStatus("ended");
      else setStatus("reconnecting");
    };

    return () => {
      source.close();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [runId]);

  return { view, status, clockSkew: skewRef };
}
