import { defineConfig } from "@trigger.dev/sdk";
import { LangfuseExporter } from "./src/observability/langfuse";

export default defineConfig({
  project: "proj_wyrlfblciupfknnpcjcf",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
  // Every span of a task (including the harness's mission/phase/agent/tool spans and the AI SDK's LLM spans) also goes
  // to Langfuse. The exporter reads LANGFUSE_* at runtime and drops spans when they are not set.
  telemetry: {
    exporters: [new LangfuseExporter()],
  },
});
