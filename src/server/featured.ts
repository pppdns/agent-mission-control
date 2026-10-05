import type { RunEvent } from "@/harness/events";
import { buildPreview, PREVIEW_VERSION, type RunPreview } from "@/harness/preview";
import { supabase } from "./supabase";

const PAGE = 1000;
const MAX_FEATURED = 12;

interface FeaturedRow {
  id: string;
  title: string | null;
  prompt: string;
  task_class: string | null;
  preview: RunPreview | null;
}

async function loadEvents(runId: string): Promise<RunEvent[]> {
  const db = supabase();
  const events: RunEvent[] = [];
  let cursor = 0;
  for (;;) {
    const { data, error } = await db
      .from("events")
      .select("seq, ts, type, agent_id, data")
      .eq("run_id", runId)
      .gt("seq", cursor)
      .order("seq", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) events.push({ runId, seq: row.seq, ts: row.ts, type: row.type, agentId: row.agent_id, data: row.data } as RunEvent);
    if (!data || data.length < PAGE) return events;
    cursor = data[data.length - 1].seq;
  }
}

/** Builds the digest for a run that has none (or an outdated one) and caches it on the row. */
async function ensurePreview(row: FeaturedRow): Promise<RunPreview | null> {
  if (row.preview?.v === PREVIEW_VERSION) return row.preview;
  try {
    const events = await loadEvents(row.id);
    if (events.length === 0) return null;
    const preview = buildPreview(events, { id: row.id, title: row.title, prompt: row.prompt, taskClass: row.task_class });
    await supabase().from("runs").update({ preview }).eq("id", row.id);
    return preview;
  } catch {
    return null;
  }
}

async function loadFixturePreviews(): Promise<RunPreview[]> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  return Promise.all(
    ["loop", "hitl"].map(async (name) => {
      const events = JSON.parse(await readFile(join(process.cwd(), "tests/fixtures", `run-${name}.json`), "utf8")) as RunEvent[];
      return buildPreview(events, { id: `fixture-${name}` });
    }),
  );
}

/** Featured, completed, visible runs with their landing-page digests, in curated order. */
export async function loadFeatured(): Promise<RunPreview[]> {
  if (process.env.E2E_FIXTURES === "1") return loadFixturePreviews();
  try {
    const { data } = await supabase()
      .from("runs")
      .select("id, title, prompt, task_class, preview")
      .eq("featured", true)
      .eq("hidden", false)
      .eq("status", "completed")
      .order("featured_order", { ascending: true })
      .limit(MAX_FEATURED);
    const previews = await Promise.all(((data ?? []) as FeaturedRow[]).map(ensurePreview));
    return previews.filter((p): p is RunPreview => p !== null && p.agents.length > 1);
  } catch {
    return [];
  }
}
