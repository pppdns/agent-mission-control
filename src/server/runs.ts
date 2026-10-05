import { EMPTY_TOTALS, type Totals } from "../harness/types";
import { supabase } from "./supabase";

/** Longer than any time a run can sit in the queue; past this, a queued run never started. */
export const STALE_RUN_MS = 25 * 60 * 1000;
/** A started run emits events at least every few seconds, and a human approval waits at most 5 minutes. */
export const STALE_ACTIVITY_MS = 12 * 60 * 1000;
/** Absolute ceiling for any non-terminal run, approvals and a resumed attempt included. */
export const MAX_RUN_AGE_MS = 75 * 60 * 1000;

const ACTIVE = ["queued", "running", "waiting"];

/** True when a non-terminal run has stopped making progress: queued too long, silent too long, or simply too old. */
export async function isRunStale(runId: string, run: { status: string; created_at: string }): Promise<boolean> {
  if (!ACTIVE.includes(run.status)) return false;
  const age = Date.now() - Date.parse(run.created_at);
  if (age > MAX_RUN_AGE_MS) return true;
  if (run.status === "queued") return age > STALE_RUN_MS;
  const { data: last } = await supabase()
    .from("events")
    .select("ts")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastActivity = last?.ts ?? Date.parse(run.created_at);
  return Date.now() - lastActivity > STALE_ACTIVITY_MS;
}

/**
 * Marks a run failed from outside the runtime (task crash, kill, or a run that never started) and appends a
 * terminal `run.failed` event so the event log, live viewers, and replays all agree on how the run ended.
 * No-op when the run already reached a terminal status.
 */
export async function failRunExternally(runId: string, reason: string): Promise<void> {
  const db = supabase();
  const { data: run } = await db
    .from("runs")
    .select("status, totals, started_at, created_at")
    .eq("id", runId)
    .maybeSingle();
  if (!run || !ACTIVE.includes(run.status)) return;

  const { data: last } = await db
    .from("events")
    .select("seq")
    .eq("run_id", runId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const totals = { ...EMPTY_TOTALS, ...((run.totals as Partial<Totals> | null) ?? {}) };
  const startedAt = Date.parse(run.started_at ?? run.created_at);
  await db.from("events").upsert(
    {
      run_id: runId,
      seq: (last?.seq ?? 0) + 1,
      ts: Date.now(),
      type: "run.failed",
      agent_id: null,
      data: { error: reason, totals, durationMs: Math.max(0, Date.now() - startedAt) },
    },
    { onConflict: "run_id,seq", ignoreDuplicates: true },
  );
  await db
    .from("runs")
    .update({ status: "failed", error: reason, finished_at: new Date().toISOString() })
    .eq("id", runId)
    .in("status", ACTIVE);
  await db.from("hitl_requests").update({ status: "timed_out" }).eq("run_id", runId).eq("status", "pending");
}
