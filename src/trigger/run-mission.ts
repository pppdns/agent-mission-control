import { logger, queue, task } from "@trigger.dev/sdk";
import { mcpServersFromEnv } from "../harness/env";
import { AgentRuntime } from "../harness/runtime";
import { failRunExternally } from "../server/runs";
import { supabase } from "../server/supabase";
import { SupabaseRunStore } from "../server/supabase-store";
import { TriggerApprovalGateway } from "./approvals";

/** Global concurrency cap for live runs; extra runs wait in the "queued" state. */
export const missionQueue = queue({ name: "missions", concurrencyLimit: 5 });

/**
 * Thin executor around the runtime-agnostic AgentRuntime. The harness itself has no Trigger.dev imports.
 * The runtime records its own handled failures and returns normally, so only crashes reach the retry. A retry
 * resumes from the latest checkpoint instead of starting over, which keeps spend and the event log intact.
 */
export const runMission = task({
  id: "run-mission",
  queue: missionQueue,
  maxDuration: 900,
  retry: { maxAttempts: 2, minTimeoutInMs: 2000, maxTimeoutInMs: 5000 },
  run: async (payload: { runId: string }, { ctx }) => {
    const { data: run, error } = await supabase()
      .from("runs")
      .select("id, prompt, hidden, status")
      .eq("id", payload.runId)
      .single();
    if (error || !run) throw new Error(`Run ${payload.runId} not found`);
    if (run.hidden) return { skipped: true };
    if (run.status === "completed" || run.status === "failed") return { skipped: true, status: run.status };

    const runtime = new AgentRuntime({
      runId: run.id,
      prompt: run.prompt,
      store: new SupabaseRunStore(),
      keys: { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY },
      mcp: mcpServersFromEnv(process.env),
      approvals: new TriggerApprovalGateway(run.id),
    });
    const attempt = ctx.attempt.number;
    const summary = attempt > 1 ? await runtime.resume(attempt) : await runtime.run();
    logger.log("mission finished", { runId: run.id, attempt, ...summary });
    return summary;
  },
  // The runtime records its own failures; this covers crashes and kills that happen outside it.
  onFailure: async ({ payload, error }) => {
    const message = error instanceof Error ? error.message : String(error);
    await failRunExternally(payload.runId, `The run stopped unexpectedly: ${message.slice(0, 300)}`);
  },
});
