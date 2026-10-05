import { wait } from "@trigger.dev/sdk";
import type { ApprovalGateway, HitlAnswer } from "../harness/approvals";
import type { HitlRequest } from "../harness/types";
import { supabase } from "../server/supabase";

/**
 * Human approvals backed by Trigger.dev wait tokens. The task suspends (no compute is billed) until the
 * `resolveHitl` server action completes the token, or the token times out and the recommended option wins.
 * The token id lives only in `hitl_requests`, never in the public event log.
 */
export class TriggerApprovalGateway implements ApprovalGateway {
  private readonly tokens = new Map<string, string>();

  constructor(private readonly runId: string) {}

  async open(req: HitlRequest): Promise<{ deadlineTs: number }> {
    const db = supabase();
    const { data: existing } = await db
      .from("hitl_requests")
      .select("token_id, deadline")
      .eq("run_id", this.runId)
      .eq("id", req.id)
      .maybeSingle();
    if (existing) {
      // A resumed attempt re-opens the same request: keep its token and original deadline.
      this.tokens.set(req.id, existing.token_id);
      return { deadlineTs: Date.parse(existing.deadline) };
    }

    const deadline = new Date(Date.now() + req.timeoutMs);
    const token = await wait.createToken({ timeout: deadline, idempotencyKey: `${this.runId}:${req.id}` });
    this.tokens.set(req.id, token.id);
    const { error } = await db.from("hitl_requests").upsert(
      {
        run_id: this.runId,
        id: req.id,
        token_id: token.id,
        reason: req.reason,
        question: req.question,
        options: req.options,
        recommended: req.recommended,
        deadline: deadline.toISOString(),
        status: "pending",
      },
      { onConflict: "run_id,id", ignoreDuplicates: true },
    );
    if (error) throw new Error(`save approval request: ${error.message}`);
    return { deadlineTs: deadline.getTime() };
  }

  async wait(req: HitlRequest): Promise<HitlAnswer> {
    const tokenId = this.tokens.get(req.id);
    if (!tokenId) throw new Error(`Approval ${req.id} was never opened`);
    const result = await wait.forToken<{ optionId?: string }>(tokenId);
    if (result.ok && result.output?.optionId) return { optionId: result.output.optionId, resolvedBy: "visitor" };
    await supabase()
      .from("hitl_requests")
      .update({ status: "timed_out", resolved_at: new Date().toISOString(), resolution: { optionId: req.recommended }, resolved_by: "timeout" })
      .eq("run_id", this.runId)
      .eq("id", req.id)
      .eq("status", "pending");
    return { optionId: req.recommended, resolvedBy: "timeout" };
  }
}
