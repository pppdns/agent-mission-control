"use server";

import { randomBytes } from "node:crypto";
import { tasks } from "@trigger.dev/sdk";
import { checkBotId } from "botid/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimits, hashIp, liveBudgetLeft, LIMITS, moderate } from "@/server/guard";
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

  if (!(await liveBudgetLeft())) {
    return fail("Today's live-demo budget is used up. Come back tomorrow, or watch a replay.");
  }
  const limited = await checkRateLimits(ipHash);
  if (!limited.ok) return fail(limited.message);

  const rejection = await moderate(prompt);
  if (rejection) return fail(rejection);

  const id = randomBytes(12).toString("base64url");
  const db = supabase();
  const { error: insertError } = await db
    .from("runs")
    .insert({ id, prompt, env: currentEnv(), ip_hash: ipHash, status: "queued" });
  if (insertError) return fail("Could not create the run. Please try again.");

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
