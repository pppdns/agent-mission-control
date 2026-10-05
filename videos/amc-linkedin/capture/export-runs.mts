/**
 * Exports the event logs of completed public runs from Supabase (read-only) into capture/runs/.
 *
 *   pnpm tsx --env-file=.env.local videos/amc-linkedin/capture/export-runs.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase } from "../../../src/server/supabase";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "runs");
const PAGE = 1000;
const db = supabase();

const { data: runs, error } = await db
  .from("runs")
  .select("id, title, prompt, task_class, totals, featured, featured_order, created_at")
  .eq("status", "completed")
  .eq("hidden", false)
  .order("created_at", { ascending: false })
  .limit(40);
if (error) throw new Error(error.message);

mkdirSync(OUT, { recursive: true });
const index = [];
for (const run of runs ?? []) {
  const events = [];
  for (let cursor = 0; ; ) {
    const { data, error: eventsError } = await db
      .from("events")
      .select("seq, ts, type, agent_id, data")
      .eq("run_id", run.id)
      .gt("seq", cursor)
      .order("seq", { ascending: true })
      .limit(PAGE);
    if (eventsError) throw new Error(eventsError.message);
    for (const row of data ?? []) events.push({ runId: run.id, seq: row.seq, ts: row.ts, type: row.type, agentId: row.agent_id, data: row.data });
    if (!data || data.length < PAGE) break;
    cursor = data[data.length - 1].seq;
  }
  writeFileSync(join(OUT, `${run.id}.json`), JSON.stringify(events));
  index.push({ id: run.id, title: run.title, prompt: run.prompt, taskClass: run.task_class, featuredOrder: run.featured ? run.featured_order : null, events: events.length });
  console.log(`${run.id}  ${String(events.length).padStart(4)} events  ${run.title}`);
}
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2));
