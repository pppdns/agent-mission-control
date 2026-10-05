import { EMPTY_TOTALS, type Totals } from "../harness/types";
import { supabase } from "./supabase";

/** Longer than the task's max duration plus time spent queued; past this, a non-terminal run is dead. */
export const STALE_RUN_MS = 25 * 60 * 1000;

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
  if (!run || run.status === "completed" || run.status === "failed") return;

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
    .in("status", ["queued", "running"]);
}
