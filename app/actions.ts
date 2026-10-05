"use server";

import { randomBytes } from "node:crypto";
import { tasks, wait } from "@trigger.dev/sdk";
import { checkBotId } from "botid/server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createRunRow, hashIp, isOperator, liveBudgetLeft, LIMITS, moderate, OPERATOR_COOKIE } from "@/server/guard";
import { currentEnv, supabase } from "@/server/supabase";

export interface CreateRunState {
  error: string | null;
  prompt: string;
}

export async function createRun(_prev: CreateRunState, formData: FormData): Promise<CreateRunState> {
  const prompt = String(formData.get("prompt") ?? "").trim();
  const fail = (error: string): CreateRunState => ({ error, prompt });

  if (prompt.length < 8) return fail("Give the agents a bit more to work with (at least a short sentence).");
  if (prompt.length > LIMITS.maxInputChars) return fail(`Prompts are limited to ${LIMITS.maxInputChars} characters.`);

  const verification = await checkBotId();
  if (verification.isBot) return fail("Automated traffic can't start runs.");

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  const ipHash = hashIp(ip);
  const operator = isOperator((await cookies()).get(OPERATOR_COOKIE)?.value);

  const budgetOpen = await liveBudgetLeft().catch(() => null);
  if (budgetOpen === null) return fail("Could not check today's demo budget. Please try again.");
  if (!budgetOpen) {
    return fail("Today's live-demo budget is used up. Come back tomorrow, or watch a replay.");
  }

  const rejection = await moderate(prompt);
  if (rejection) return fail(rejection);

  const id = randomBytes(12).toString("base64url");
  const created = await createRunRow({ id, prompt, env: currentEnv(), ipHash, operator });
  if (!created.ok) return fail(created.message);

  const db = supabase();
  try {
    const handle = await tasks.trigger("run-mission", { runId: id }, { idempotencyKey: `run-${id}` });
    await db.from("runs").update({ trigger_run_id: handle.id }).eq("id", id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await db.from("runs").update({ status: "failed", error: `Could not start the run: ${message}` }).eq("id", id);
    return fail("The run could not be started. Please try again in a moment.");
  }

  redirect(`/run/${id}`);
}

export type ResolveHitlResult = { ok: true } | { ok: false; error: string };

/**
 * Answers a pending human approval. Anyone viewing the run may answer; the first answer wins via a conditional
 * update, and only then is the task's wait token completed. The runtime records the outcome in the event log.
 */
export async function resolveHitl(runId: string, requestId: string, optionId: string): Promise<ResolveHitlResult> {
  if (![runId, requestId, optionId].every((v) => typeof v === "string" && v.length > 0 && v.length < 64)) {
    return { ok: false, error: "Invalid request." };
  }
  const verification = await checkBotId();
  if (verification.isBot) return { ok: false, error: "Automated traffic can't answer." };
  const db = supabase();
  const { data: run } = await db.from("runs").select("status, hidden").eq("id", runId).maybeSingle();
  if (!run || run.hidden) return { ok: false, error: "Run not found." };

  const { data: request } = await db
    .from("hitl_requests")
    .select("token_id, options, status, deadline")
    .eq("run_id", runId)
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { ok: false, error: "This decision no longer exists." };
  if (request.status !== "pending" || Date.parse(request.deadline) < Date.now()) {
    return { ok: false, error: "Someone already answered, or the time ran out." };
  }
  const options = (request.options as { id: string }[] | null) ?? [];
  if (!options.some((o) => o.id === optionId)) return { ok: false, error: "Unknown option." };

  const { data: claimed, error } = await db
    .from("hitl_requests")
    .update({ status: "resolved", resolution: { optionId }, resolved_by: "visitor", resolved_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("id", requestId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: "Could not record your answer. Please try again." };
  if (!claimed?.length) return { ok: false, error: "Someone already answered." };

  try {
    await wait.completeToken(request.token_id, { optionId });
  } catch {
    await db.from("hitl_requests").update({ status: "pending", resolution: null, resolved_by: null, resolved_at: null }).eq("run_id", runId).eq("id", requestId);
    return { ok: false, error: "Could not reach the run. Please try again." };
  }
  return { ok: true };
}
