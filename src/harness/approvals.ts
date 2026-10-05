import type { BudgetTracker } from "./budget";
import type { EventBus } from "./events";
import type { RunStore } from "./store";
import type { HitlOption, HitlRequest } from "./types";

export interface HitlAnswer {
  optionId: string;
  resolvedBy: "visitor" | "timeout";
}

/**
 * Runtime-agnostic human approval. `open` makes the request answerable (persisted, with a deadline) before the
 * runtime announces it; `wait` blocks until a visitor answers or the deadline passes.
 */
export interface ApprovalGateway {
  open(req: HitlRequest): Promise<{ deadlineTs: number }>;
  wait(req: HitlRequest): Promise<HitlAnswer>;
}

/** Local scripts and tests: answers immediately with the recommended option. */
export class AutoApprovalGateway implements ApprovalGateway {
  constructor(private readonly delayMs = 0) {}

  async open(req: HitlRequest) {
    return { deadlineTs: Date.now() + req.timeoutMs };
  }

  async wait(req: HitlRequest): Promise<HitlAnswer> {
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return { optionId: req.recommended, resolvedBy: "timeout" };
  }
}

export interface ApprovalOutcome {
  option: HitlOption;
  resolvedBy: "visitor" | "timeout";
  waitedMs: number;
}

/** Runs one human approval: announce, pause the run's clock, wait, resume, record the answer. */
export class ApprovalManager {
  constructor(
    private readonly runId: string,
    private readonly bus: EventBus,
    private readonly budget: BudgetTracker,
    private readonly store: RunStore,
    private readonly gateway: ApprovalGateway,
  ) {}

  async ask(req: HitlRequest, agentId: string): Promise<ApprovalOutcome> {
    const { deadlineTs } = await this.gateway.open(req);
    this.bus.emit(
      {
        type: "hitl.requested",
        data: {
          requestId: req.id,
          reason: req.reason,
          question: req.question,
          context: req.context,
          options: req.options,
          recommended: req.recommended,
          timeoutMs: req.timeoutMs,
          deadlineTs,
        },
      },
      agentId,
    );
    this.budget.pause();
    await this.store.updateRun(this.runId, { status: "waiting" }).catch(() => undefined);
    await this.bus.flush().catch(() => undefined);

    const startedAt = Date.now();
    let answer: HitlAnswer;
    try {
      answer = await this.gateway.wait(req);
    } catch {
      answer = { optionId: req.recommended, resolvedBy: "timeout" };
    }
    const waitedMs = Date.now() - startedAt;

    this.budget.resume();
    await this.store.updateRun(this.runId, { status: "running" }).catch(() => undefined);
    const option = req.options.find((o) => o.id === answer.optionId) ?? req.options.find((o) => o.id === req.recommended)!;
    this.bus.emit({ type: "hitl.resolved", data: { requestId: req.id, optionId: option.id, resolvedBy: answer.resolvedBy, waitedMs } }, agentId);
    return { option, resolvedBy: answer.resolvedBy, waitedMs };
  }
}
