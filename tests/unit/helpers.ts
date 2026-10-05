import { DEFAULT_LIMITS } from "@/harness/config";
import { EventBus, type EventSink, type RunEvent } from "@/harness/events";
import type { AgentInfo } from "@/harness/types";

export class CollectingSink implements EventSink {
  events: RunEvent[] = [];
  async append(_runId: string, events: RunEvent[]) {
    this.events.push(...events);
  }
}

export function testBus() {
  const sink = new CollectingSink();
  return { bus: new EventBus("test-run", sink), sink };
}

export const LIMITS = { ...DEFAULT_LIMITS };

export function agentInfo(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: "researcher-1",
    role: "researcher",
    name: "Researcher 1",
    goal: "Find primary evidence",
    angle: null,
    parentId: "orchestrator",
    route: "simple",
    rule: "simple_parallel_research",
    routeReason: "test",
    provider: "openai",
    model: "gpt-6-luna",
    tools: ["web_search"],
    round: 1,
    ...overrides,
  };
}
