/**
 * Tracer provider for processes that don't have one: local scripts and evals.
 * (The Trigger.dev worker has its own provider; `trigger.config.ts` adds the Langfuse exporter to it.)
 */
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseExporter, langfuseConfigured } from "./langfuse";

let provider: NodeTracerProvider | null = null;

/** Registers a global tracer provider exporting to Langfuse. Returns false (and does nothing) without Langfuse keys. */
export function startTracing(): boolean {
  if (provider) return true;
  if (!langfuseConfigured()) return false;
  provider = new NodeTracerProvider({ spanProcessors: [new BatchSpanProcessor(new LangfuseExporter())] });
  provider.register();
  return true;
}

export async function flushTracing() {
  await provider?.forceFlush();
}

export async function stopTracing() {
  await provider?.shutdown();
  provider = null;
}
