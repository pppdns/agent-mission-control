import type { EventSink, RunEvent } from "./events";
import type {
  AgentInfo,
  AgentMessage,
  Artifact,
  RunStatus,
  Source,
  TaskClass,
  Totals,
} from "./types";

export interface RunPatch {
  status?: RunStatus;
  taskClass?: TaskClass | "out_of_scope" | null;
  title?: string | null;
  totals?: Totals;
  error?: string | null;
  startedAt?: string;
  finishedAt?: string;
}

/** Everything the harness persists. Implemented by Supabase in production and in memory for scripts and tests. */
export interface RunStore extends EventSink {
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  saveAgent(runId: string, agent: AgentInfo, status: string): Promise<void>;
  saveMessage(runId: string, message: AgentMessage): Promise<void>;
  saveSource(runId: string, source: Source): Promise<void>;
  saveArtifactVersion(runId: string, artifact: Artifact, authorId: string | null, summary: string): Promise<void>;
}

export class MemoryStore implements RunStore {
  events: RunEvent[] = [];
  agents = new Map<string, AgentInfo>();
  messages: AgentMessage[] = [];
  sources = new Map<string, Source>();
  artifactVersions: Artifact[] = [];
  run: RunPatch = {};

  async append(_runId: string, events: RunEvent[]) {
    this.events.push(...events);
  }
  async updateRun(_runId: string, patch: RunPatch) {
    this.run = { ...this.run, ...patch };
  }
  async saveAgent(_runId: string, agent: AgentInfo) {
    this.agents.set(agent.id, agent);
  }
  async saveMessage(_runId: string, message: AgentMessage) {
    this.messages.push(message);
  }
  async saveSource(_runId: string, source: Source) {
    this.sources.set(source.id, source);
  }
  async saveArtifactVersion(_runId: string, artifact: Artifact) {
    this.artifactVersions.push(structuredClone(artifact));
  }
}
