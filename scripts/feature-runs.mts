/**
 * Curates the runs shown on the landing page.
 *
 *   pnpm feature                      lists recent completed runs and their featured position
 *   pnpm feature <id> [<id> ...]      features exactly these runs, in this order (others are unfeatured)
 *   pnpm feature --unfeature <id> ... removes runs from the landing page
 */
import { supabase } from "../src/server/supabase";

const args = process.argv.slice(2);
const unfeature = args.includes("--unfeature");
const ids = args.filter((a) => !a.startsWith("--"));
const db = supabase();

async function list() {
  const { data, error } = await db
    .from("runs")
    .select("id, status, featured, featured_order, task_class, title, prompt, hidden, totals, created_at")
    .eq("status", "completed")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const mark = r.featured ? `#${r.featured_order ?? "?"}` : "  ";
    console.log(`${mark.padEnd(4)} ${r.id}  ${(r.task_class ?? "").padEnd(10)}  $${Number(r.totals?.costUsd ?? 0).toFixed(2)}  ${r.title ?? r.prompt}`);
  }
}

if (ids.length === 0) {
  await list();
} else if (unfeature) {
  const { error } = await db.from("runs").update({ featured: false, featured_order: null }).in("id", ids);
  if (error) throw new Error(error.message);
  await list();
} else {
  const { data: found, error } = await db.from("runs").select("id, status, hidden").in("id", ids);
  if (error) throw new Error(error.message);
  const missing = ids.filter((id) => !found?.some((r) => r.id === id && r.status === "completed" && !r.hidden));
  if (missing.length > 0) throw new Error(`Not completed or not visible: ${missing.join(", ")}`);
  const { error: clearError } = await db.from("runs").update({ featured: false, featured_order: null }).eq("featured", true).not("id", "in", `(${ids.join(",")})`);
  if (clearError) throw new Error(clearError.message);
  for (const [i, id] of ids.entries()) {
    const { error: setError } = await db.from("runs").update({ featured: true, featured_order: i + 1 }).eq("id", id);
    if (setError) throw new Error(setError.message);
  }
  await list();
}
