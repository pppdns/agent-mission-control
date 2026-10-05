import type { ArtifactManager } from "./artifact";
import type { BudgetTracker } from "./budget";
import type { EventBus } from "./events";
import type { EvidenceStore } from "./evidence";
import type { LlmClient } from "./models";
import type { RunStore } from "./store";
import type { ToolRegistry } from "./tools";
import type { AgentInfo, AgentMessage, Limits, MessageType } from "./types";

/** Everything an agent needs from the harness. Passed explicitly; nothing is global. */
export class RunContext {
  readonly agents = new Map<string, AgentInfo>();
  readonly messages: AgentMessage[] = [];
  private messageCounter = 0;
  private pending: Promise<unknown>[] = [];

  constructor(
    readonly runId: string,
    readonly prompt: string,
    readonly limits: Limits,
    readonly bus: EventBus,
    readonly store: RunStore,
    readonly budget: BudgetTracker,
    readonly llm: LlmClient,
    readonly tools: ToolRegistry,
    readonly evidence: EvidenceStore,
    readonly artifact: ArtifactManager,
  ) {}

  spawn(agent: AgentInfo) {
    this.agents.set(agent.id, agent);
    this.budget.totals.agents = this.agents.size;
    this.bus.emit({ type: "routing.decided", data: { route: agent.route, provider: agent.provider, model: agent.model, reason: agent.routeReason } }, agent.id);
    this.bus.emit({ type: "agent.spawned", data: { agent } }, agent.parentId ?? agent.id);
    this.pending.push(this.store.saveAgent(this.runId, agent, "spawned").catch(() => undefined));
  }

  send(from: string, to: string, type: MessageType, content: string, refs: string[] = []): AgentMessage {
    const message: AgentMessage = {
      id: `m${++this.messageCounter}`,
      from,
      to,
      type,
      content: content.trim(),
      refs: this.evidence.validIds(refs),
    };
    this.messages.push(message);
    this.bus.emit({ type: "agent.message_sent", data: { message } }, from);
    this.pending.push(this.store.saveMessage(this.runId, message).catch(() => undefined));
    return message;
  }

  inbox(agentId: string): AgentMessage[] {
    return this.messages.filter((m) => m.to === agentId);
  }

  /** Resolve a free-text recipient (agent name, role or id) to an agent id. */
  resolveRecipient(raw: string, fallbackId: string, excludeId?: string): string {
    const needle = raw.trim().toLowerCase();
    const all = [...this.agents.values()].filter((a) => a.id !== excludeId);
    const exact =
      all.find((a) => a.id.toLowerCase() === needle) ??
      all.find((a) => a.name.toLowerCase() === needle) ??
      all.find((a) => a.role.replace("_", " ") === needle || a.role === needle) ??
      all.find((a) => a.name.toLowerCase().includes(needle) || needle.includes(a.name.toLowerCase()));
    return exact?.id ?? fallbackId;
  }

  async settle() {
    await Promise.allSettled(this.pending);
    this.pending = [];
    await this.artifact.settle();
  }
}
