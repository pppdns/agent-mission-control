import { logger, queue, task } from "@trigger.dev/sdk";
import { mcpServersFromEnv } from "../harness/env";
import { AgentRuntime } from "../harness/runtime";
import { supabase } from "../server/supabase";
import { SupabaseRunStore } from "../server/supabase-store";

/** Global concurrency cap for live runs; extra runs wait in the "queued" state. */
export const missionQueue = queue({ name: "missions", concurrencyLimit: 5 });

/**
 * Thin executor around the runtime-agnostic AgentRuntime. The harness itself has no Trigger.dev imports.
 * Retries are off: a retry would replay LLM and tool spend and duplicate the event log.
 */
export const runMission = task({
  id: "run-mission",
  queue: missionQueue,
  maxDuration: 900,
  retry: { maxAttempts: 1 },
  run: async (payload: { runId: string }) => {
    const { data: run, error } = await supabase()
      .from("runs")
      .select("id, prompt, hidden")
      .eq("id", payload.runId)
      .single();
    if (error || !run) throw new Error(`Run ${payload.runId} not found`);
    if (run.hidden) return { skipped: true };

    const runtime = new AgentRuntime({
      runId: run.id,
      prompt: run.prompt,
      store: new SupabaseRunStore(),
      keys: { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY },
      mcp: mcpServersFromEnv(process.env),
    });
    const summary = await runtime.run();
    logger.log("mission finished", { runId: run.id, ...summary });
    return summary;
  },
});
