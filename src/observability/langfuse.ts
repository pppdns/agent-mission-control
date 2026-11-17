/**
 * Sends OpenTelemetry spans to Langfuse over OTLP/HTTP.
 * Configuration is read lazily from the environment at export time, so the exporter can be constructed where env
 * vars are not available yet (Trigger.dev evaluates `trigger.config.ts` at build time). Without keys it drops spans.
 */
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

const DEFAULT_BASE_URL = "https://cloud.langfuse.com";

export function langfuseConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY);
}

export class LangfuseExporter implements SpanExporter {
  private inner: OTLPTraceExporter | null | undefined;

  private exporter(): OTLPTraceExporter | null {
    if (this.inner !== undefined) return this.inner;
    const env = process.env;
    if (!langfuseConfigured(env)) return (this.inner = null);
    const base = (env.LANGFUSE_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
    const auth = Buffer.from(`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`).toString("base64");
    return (this.inner = new OTLPTraceExporter({
      url: `${base}/api/public/otel/v1/traces`,
      headers: { Authorization: `Basic ${auth}` },
    }));
  }

  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    const exporter = this.exporter();
    if (!exporter) return done({ code: ExportResultCode.SUCCESS });
    exporter.export(spans, done);
  }

  async forceFlush() {
    await this.inner?.forceFlush();
  }

  async shutdown() {
    await this.inner?.shutdown();
  }
}
