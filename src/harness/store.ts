import type { EventSink, RunEvent } from "./events";
import type {
  AgentInfo,
  AgentMessage,
  AgentStatus,
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

export interface CheckpointRecord {
  id: string;
  /** Event seq at the time the checkpoint was taken. */
  seq: number;
  phase: string;
  round: number;
  label: string;
  state: unknown;
}

export interface ResumePoint {
  checkpoint: CheckpointRecord | null;
  lastSeq: number;
  /** Totals last synced to the run row; they include spend after the checkpoint. */
  totals: Totals | null;
}

/** Everything the harness persists. Implemented by Supabase in production and in memory for scripts and tests. */
export interface RunStore extends EventSink {
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  saveAgent(runId: string, agent: AgentInfo, status: AgentStatus): Promise<void>;
  updateAgentStatus(runId: string, agentId: string, status: AgentStatus): Promise<void>;
  saveMessage(runId: string, message: AgentMessage): Promise<void>;
  saveSource(runId: string, source: Source): Promise<void>;
  saveArtifactVersion(runId: string, artifact: Artifact, authorId: string | null, summary: string): Promise<void>;
  saveCheckpoint(runId: string, checkpoint: CheckpointRecord): Promise<void>;
  loadResumePoint(runId: string): Promise<ResumePoint>;
}

export class MemoryStore implements RunStore {
  events: RunEvent[] = [];
  agents = new Map<string, AgentInfo>();
  agentStatus = new Map<string, AgentStatus>();
  messages: AgentMessage[] = [];
  sources = new Map<string, Source>();
  artifactVersions: Artifact[] = [];
  checkpoints: CheckpointRecord[] = [];
  run: RunPatch = {};

  async append(_runId: string, events: RunEvent[]) {
    this.events.push(...events);
  }
  async updateRun(_runId: string, patch: RunPatch) {
    this.run = { ...this.run, ...patch };
  }
  async saveAgent(_runId: string, agent: AgentInfo, status: AgentStatus) {
    this.agents.set(agent.id, agent);
    this.agentStatus.set(agent.id, status);
  }
  async updateAgentStatus(_runId: string, agentId: string, status: AgentStatus) {
    this.agentStatus.set(agentId, status);
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
  async saveCheckpoint(_runId: string, checkpoint: CheckpointRecord) {
    this.checkpoints.push(structuredClone(checkpoint));
  }
  async loadResumePoint(): Promise<ResumePoint> {
    return {
      checkpoint: this.checkpoints.at(-1) ?? null,
      lastSeq: this.events.at(-1)?.seq ?? 0,
      totals: this.run.totals ?? null,
    };
  }
}
