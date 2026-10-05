import type { ArtifactManager } from "./artifact";
import type { BudgetTracker } from "./budget";
import { ROUTES } from "./config";
import type { Compactor, ContextManager } from "./context-window";
import type { EventBus } from "./events";
import type { EvidenceStore } from "./evidence";
import type { LlmClient } from "./models";
import type { ModelRouter } from "./router";
import type { RunStore } from "./store";
import type { ToolRegistry } from "./tools";
import type { AgentInfo, AgentMessage, AgentRole, AgentStatus, Limits, MessageType } from "./types";

const TOOL_PERMISSIONS: Record<AgentRole, string[]> = {
  orchestrator: [],
  editor: [],
  evaluator: [],
  researcher: ["web_search", "fetch_page"],
  evidence_verifier: ["web_search", "fetch_page"],
  skeptic: ["web_search"],
};

export interface RunContextState {
  agents: AgentInfo[];
  status: Record<string, AgentStatus>;
  messages: AgentMessage[];
  messageCounter: number;
}

/** Everything an agent needs from the harness. Passed explicitly; nothing is global. */
export class RunContext {
  readonly agents = new Map<string, AgentInfo>();
  readonly status = new Map<string, AgentStatus>();
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
    readonly router: ModelRouter,
    readonly llm: LlmClient,
    readonly tools: ToolRegistry,
    readonly evidence: EvidenceStore,
    readonly artifact: ArtifactManager,
    readonly contexts: ContextManager,
    readonly compactor: Compactor,
  ) {
    bus.subscribe((e) => {
      if (!e.agentId || !this.agents.has(e.agentId)) return;
      const next: AgentStatus | null =
        e.type === "agent.started" || e.type === "agent.retasked"
          ? "running"
          : e.type === "agent.completed"
            ? "completed"
            : e.type === "agent.failed"
              ? "failed"
              : null;
      if (!next || this.status.get(e.agentId) === next) return;
      this.status.set(e.agentId, next);
      this.track(this.store.updateAgentStatus(this.runId, e.agentId, next));
    });
  }

  /** Builds an agent whose model badge comes from the router's default rule for its role. */
  makeAgent(partial: { id: string; role: AgentRole; name: string; goal: string; angle?: string | null; parentId: string | null; round?: number }): AgentInfo {
    const decision = this.router.forRole(partial.role);
    return {
      id: partial.id,
      role: partial.role,
      name: partial.name,
      goal: partial.goal,
      angle: partial.angle ?? null,
      parentId: partial.parentId,
      route: decision.route,
      rule: decision.rule,
      routeReason: decision.reason === ROUTES[decision.route].reason ? decision.reason : `${decision.reason} ${ROUTES[decision.route].reason}`,
      provider: decision.provider,
      model: decision.model,
      tools: TOOL_PERMISSIONS[partial.role],
      round: partial.round ?? 1,
    };
  }

  spawn(agent: AgentInfo) {
    this.agents.set(agent.id, agent);
    this.status.set(agent.id, "spawned");
    this.budget.totals.agents = this.agents.size;
    this.bus.emit(
      {
        type: "routing.decided",
        data: { callId: null, rule: agent.rule, route: agent.route, provider: agent.provider, model: agent.model, reason: agent.routeReason, strategy: "auto" },
      },
      agent.id,
    );
    this.bus.emit({ type: "agent.spawned", data: { agent } }, agent.parentId ?? agent.id);
    this.track(this.store.saveAgent(this.runId, agent, "spawned"));
  }

  /** Gives an existing agent a new goal for a follow-up round. */
  retask(agentId: string, goal: string, angle: string | null, round: number) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    const updated: AgentInfo = { ...agent, goal, angle: angle ?? agent.angle };
    this.agents.set(agentId, updated);
    this.bus.emit({ type: "agent.retasked", data: { goal, angle: updated.angle, round } }, agentId);
    this.send(agent.parentId ?? "orchestrator", agentId, "delegation", goal);
  }

  hasRole(role: AgentRole): boolean {
    return [...this.agents.values()].some((a) => a.role === role);
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
    this.track(this.store.saveMessage(this.runId, message));
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

  snapshot(): RunContextState {
    return {
      agents: [...this.agents.values()].map((a) => ({ ...a, tools: [...a.tools] })),
      status: Object.fromEntries(this.status),
      messages: this.messages.map((m) => ({ ...m, refs: [...m.refs] })),
      messageCounter: this.messageCounter,
    };
  }

  restore(state: RunContextState) {
    this.agents.clear();
    this.status.clear();
    for (const a of state.agents) this.agents.set(a.id, { ...a });
    for (const [id, s] of Object.entries(state.status)) this.status.set(id, s);
    this.messages.splice(0, this.messages.length, ...state.messages.map((m) => ({ ...m })));
    this.messageCounter = state.messageCounter;
    this.budget.totals.agents = this.agents.size;
  }

  async settle() {
    await Promise.allSettled(this.pending);
    this.pending = [];
    await this.artifact.settle();
  }

  private track(p: Promise<unknown>) {
    this.pending.push(p.catch(() => undefined));
  }
}
