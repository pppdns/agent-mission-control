import type { ZodType } from "zod";
import type { BudgetTracker } from "./budget";
import { EVENT_PREVIEW_CHARS } from "./config";
import type { EventBus, ToolManifestEntry } from "./events";
import type { EvidenceStore } from "./evidence";
import type { ToolSpec } from "./models";

export interface ToolContext {
  agentId: string;
  evidence: EvidenceStore;
}

export interface ToolResult {
  /** What the model sees. */
  content: string;
  sourceIds: string[];
}

export class ToolRefusal extends Error {}

export interface ToolDef<I = unknown> {
  name: string;
  description: string;
  inputSchema: ZodType<I>;
  server: string | null;
  mcpTool: string | null;
  budget: "search" | "fetch" | null;
  /** Raw schema shown in the UI's tool inspector (the MCP server's own input schema). */
  displaySchema: unknown;
  /** Fail-closed pre-check, run before budget is reserved. Return a refusal message to block the call. */
  validate?(input: I, ctx: ToolContext): string | null;
  /** Parameters as sent to the underlying tool (shown in the UI). */
  toParams?(input: I): unknown;
  execute(input: I, ctx: ToolContext): Promise<ToolResult>;
}

export interface InvokeRequest {
  toolName: string;
  rawInput: unknown;
  toolCallId: string;
  llmCallId: string | null;
  agentId: string;
  allowed: string[];
}

export interface InvokeResult {
  ok: boolean;
  content: string;
}

const TOOL_TIMEOUT_MS = 40_000;
const MAX_ATTEMPTS = 2;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef<unknown>>();

  constructor(
    private readonly bus: EventBus,
    private readonly budget: BudgetTracker,
    private readonly evidence: EvidenceStore,
  ) {}

  register<I>(def: ToolDef<I>) {
    this.tools.set(def.name, def as unknown as ToolDef<unknown>);
  }

  has(name: string) {
    return this.tools.has(name);
  }

  manifest(): ToolManifestEntry[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      server: t.server,
      mcpTool: t.mcpTool,
      description: t.description,
      inputSchema: t.displaySchema,
      budget: t.budget,
    }));
  }

  specs(names: string[]): Record<string, ToolSpec> {
    return Object.fromEntries(
      names
        .map((n) => this.tools.get(n))
        .filter((t): t is ToolDef<unknown> => !!t)
        .map((t) => [t.name, { description: t.description, inputSchema: t.inputSchema }]),
    );
  }

  async invoke(req: InvokeRequest): Promise<InvokeResult> {
    const def = this.tools.get(req.toolName);
    const base = { toolCallId: req.toolCallId, tool: req.toolName };
    const requested = (params: unknown) =>
      this.bus.emit(
        {
          type: "tool.requested",
          data: {
            ...base,
            server: def?.server ?? null,
            mcpTool: def?.mcpTool ?? null,
            params,
            llmCallId: req.llmCallId,
          },
        },
        req.agentId,
      );
    const failed = (error: string, attempt = 1, willRetry = false, durationMs = 0) =>
      this.bus.emit({ type: "tool.failed", data: { ...base, durationMs, error, attempt, willRetry } }, req.agentId);

    if (!def || !req.allowed.includes(req.toolName)) {
      requested(req.rawInput);
      const error = `Tool "${req.toolName}" is not permitted for this agent.`;
      failed(error);
      return { ok: false, content: `ERROR: ${error}` };
    }

    const parsed = def.inputSchema.safeParse(req.rawInput);
    if (!parsed.success) {
      requested(req.rawInput);
      const error = `Invalid parameters: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
      failed(error);
      return { ok: false, content: `ERROR: ${error}` };
    }
    const input = parsed.data;
    const ctx: ToolContext = { agentId: req.agentId, evidence: this.evidence };

    const refusal = def.validate?.(input, ctx) ?? null;
    if (refusal) {
      requested(def.toParams?.(input) ?? input);
      failed(refusal);
      return { ok: false, content: `ERROR: ${refusal}` };
    }

    if (def.budget) {
      const budgetRefusal = this.budget.reserve(def.budget, req.agentId);
      if (budgetRefusal) {
        requested(def.toParams?.(input) ?? input);
        failed(budgetRefusal);
        return { ok: false, content: `ERROR: ${budgetRefusal} Work with the evidence you already have.` };
      }
    }

    requested(def.toParams?.(input) ?? input);
    let lastError = "unknown error";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await withTimeout(def.execute(input, ctx), TOOL_TIMEOUT_MS, `${def.name} timed out`);
        this.bus.emit(
          {
            type: "tool.completed",
            data: {
              ...base,
              durationMs: Date.now() - startedAt,
              resultPreview: result.content.slice(0, EVENT_PREVIEW_CHARS),
              resultChars: result.content.length,
              sourceIds: result.sourceIds,
            },
          },
          req.agentId,
        );
        return { ok: true, content: result.content };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        const willRetry = attempt < MAX_ATTEMPTS && !(error instanceof ToolRefusal);
        failed(lastError.slice(0, 500), attempt, willRetry, Date.now() - startedAt);
        if (!willRetry) break;
        this.bus.emit(
          { type: "agent.retrying", data: { reason: `${def.name} failed: ${lastError.slice(0, 140)}`, attempt, fallbackModel: null } },
          req.agentId,
        );
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
    return { ok: false, content: `ERROR: ${def.name} failed: ${lastError}` };
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
