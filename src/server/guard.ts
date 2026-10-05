import { createHash } from "node:crypto";
import { supabase, currentEnv } from "./supabase";

export const LIMITS = {
  perHour: 3,
  perDay: 10,
  maxInputChars: 2000,
  dailySpendCapUsd: 25,
};

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "amc";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Returns a rejection message when the prompt is flagged, or null when it passes. */
export async function moderate(prompt: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { results?: { flagged: boolean }[] };
    return json.results?.some((r) => r.flagged)
      ? "That prompt was flagged by content moderation, so no run was started. Try rephrasing it."
      : null;
  } catch {
    return null;
  }
}

export type GuardResult = { ok: true } | { ok: false; message: string };

export async function checkRateLimits(ipHash: string): Promise<GuardResult> {
  const db = supabase();
  const now = Date.now();
  const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("runs")
    .select("created_at, status")
    .eq("ip_hash", ipHash)
    .gte("created_at", dayAgo);
  if (error) return { ok: false, message: "Could not verify rate limits. Please try again." };

  const rows = data ?? [];
  const active = rows.filter((r) => (r.status === "queued" || r.status === "running") && r.created_at > new Date(now - 15 * 60 * 1000).toISOString());
  if (active.length >= 1) return { ok: false, message: "You already have a run in progress. Wait for it to finish first." };
  if (rows.filter((r) => r.created_at >= hourAgo).length >= LIMITS.perHour) {
    return { ok: false, message: `Limit reached: ${LIMITS.perHour} live runs per hour. You can still watch the featured runs.` };
  }
  if (rows.length >= LIMITS.perDay) {
    return { ok: false, message: `Limit reached: ${LIMITS.perDay} live runs per day. You can still watch the featured runs.` };
  }
  return { ok: true };
}

/** Global daily spend circuit breaker, summed from per-run cost telemetry. */
export async function liveBudgetLeft(): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data } = await supabase()
    .from("runs")
    .select("totals")
    .eq("env", currentEnv())
    .gte("created_at", since.toISOString());
  const spent = (data ?? []).reduce((sum, r) => sum + Number((r.totals as { costUsd?: number } | null)?.costUsd ?? 0), 0);
  return spent < LIMITS.dailySpendCapUsd;
}
