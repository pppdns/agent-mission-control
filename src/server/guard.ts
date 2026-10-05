import { createHash, timingSafeEqual } from "node:crypto";
import { supabase } from "./supabase";

export const OPERATOR_COOKIE = "amc-operator";

export const LIMITS = {
  perHour: 3,
  perDay: 10,
  maxInputChars: 2000,
  dailySpendCapUsd: 25,
  /** A queued, running or waiting run older than this no longer blocks its visitor (run time, approvals and queueing). */
  activeWindowMinutes: 30,
};

export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? process.env.SUPABASE_SECRET_KEY ?? "amc";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** True when the cookie matches `OPERATOR_TOKEN`. Without the env var nobody is an operator. */
export function isOperator(cookieValue: string | undefined): boolean {
  const token = process.env.OPERATOR_TOKEN;
  if (!token || !cookieValue) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(cookieValue), digest(token));
}

/**
 * Returns a rejection message when the prompt is flagged or cannot be checked, or null when it passes.
 * Fails closed: runs are public and permanent, so an unmoderated prompt is never persisted.
 */
export async function moderate(prompt: string): Promise<string | null> {
  const unavailable = "Content moderation is unavailable right now, so no run was started. Please try again shortly.";
  const key = process.env.OPENAI_API_KEY;
  if (!key) return unavailable;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input: prompt }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return unavailable;
    const json = (await res.json()) as { results?: { flagged: boolean }[] };
    if (!json.results?.length) return unavailable;
    return json.results.some((r) => r.flagged)
      ? "That prompt was flagged by content moderation, so no run was started. Try rephrasing it."
      : null;
  } catch {
    return unavailable;
  }
}

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  active: "You already have a run in progress. Wait for it to finish first.",
  hourly: `Limit reached: ${LIMITS.perHour} live runs per hour. You can still watch the featured runs.`,
  daily: `Limit reached: ${LIMITS.perDay} live runs per day. You can still watch the featured runs.`,
};

export type CreateRunResult = { ok: true } | { ok: false; message: string };

/** Atomically applies the per-IP rate limits (skipped for operators) and inserts the queued run (see `public.create_run`). */
export async function createRunRow(row: {
  id: string;
  prompt: string;
  env: string;
  ipHash: string;
  operator: boolean;
}): Promise<CreateRunResult> {
  const { data, error } = await supabase().rpc("create_run", {
    p_id: row.id,
    p_prompt: row.prompt,
    p_env: row.env,
    p_ip_hash: row.ipHash,
    p_per_hour: LIMITS.perHour,
    p_per_day: LIMITS.perDay,
    p_active_window: `${LIMITS.activeWindowMinutes} minutes`,
    ...(row.operator ? { p_skip_ip_limits: true } : {}),
  });
  if (error) return { ok: false, message: "Could not create the run. Please try again." };
  if (data === "ok") return { ok: true };
  return { ok: false, message: RATE_LIMIT_MESSAGES[data as string] ?? "Could not create the run. Please try again." };
}

/**
 * Global daily spend circuit breaker, summed from per-run cost telemetry across every environment
 * (dev and prod share the provider keys). Running runs report their cost as they go.
 */
export async function liveBudgetLeft(): Promise<boolean> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { data, error } = await supabase().from("runs").select("totals").gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);
  const spent = (data ?? []).reduce((sum, r) => sum + Number((r.totals as { costUsd?: number } | null)?.costUsd ?? 0), 0);
  return spent < LIMITS.dailySpendCapUsd;
}
