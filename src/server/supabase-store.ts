import type { RunEvent } from "../harness/events";
import type { CheckpointRecord, ResumePoint, RunPatch, RunStore } from "../harness/store";
import { EMPTY_TOTALS, type AgentInfo, type AgentMessage, type AgentStatus, type Artifact, type Source, type Totals } from "../harness/types";
import { supabase } from "./supabase";

function check(error: { message: string } | null, what: string) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

export class SupabaseRunStore implements RunStore {
  async append(runId: string, events: RunEvent[]) {
    if (events.length === 0) return;
    const rows = events.map((e) => ({
      run_id: runId,
      seq: e.seq,
      ts: e.ts,
      type: e.type,
      agent_id: e.agentId,
      data: (e as { data: unknown }).data,
    }));
    const { error } = await supabase().from("events").upsert(rows, { onConflict: "run_id,seq", ignoreDuplicates: true });
    check(error, "append events");
  }

  async updateRun(runId: string, patch: RunPatch) {
    const row: Record<string, unknown> = {};
    if (patch.status !== undefined) row.status = patch.status;
    if (patch.taskClass !== undefined) row.task_class = patch.taskClass;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.totals !== undefined) row.totals = patch.totals;
    if (patch.error !== undefined) row.error = patch.error;
    if (patch.startedAt !== undefined) row.started_at = patch.startedAt;
    if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
    const { error } = await supabase().from("runs").update(row).eq("id", runId);
    check(error, "update run");
  }

  async saveAgent(runId: string, agent: AgentInfo, status: AgentStatus) {
    const { error } = await supabase()
      .from("agents")
      .upsert({ run_id: runId, id: agent.id, role: agent.role, name: agent.name, status, info: agent });
    check(error, "save agent");
  }

  async updateAgentStatus(runId: string, agentId: string, status: AgentStatus) {
    const { error } = await supabase().from("agents").update({ status }).eq("run_id", runId).eq("id", agentId);
    check(error, "update agent status");
  }

  async saveMessage(runId: string, m: AgentMessage) {
    const { error } = await supabase()
      .from("messages")
      .upsert({ run_id: runId, id: m.id, from_agent: m.from, to_agent: m.to, type: m.type, content: m.content, refs: m.refs });
    check(error, "save message");
  }

  async saveSource(runId: string, s: Source) {
    const { error } = await supabase().from("sources").upsert({
      run_id: runId,
      id: s.id,
      url: s.url,
      title: s.title,
      snippet: s.snippet,
      content: s.content,
      via: s.via,
      agent_id: s.agentId,
      query: s.query,
    });
    check(error, "save source");
  }

  async saveArtifactVersion(runId: string, artifact: Artifact, authorId: string | null, summary: string) {
    const { error } = await supabase()
      .from("artifact_versions")
      .upsert({ run_id: runId, version: artifact.version, author: authorId, summary, content: artifact });
    check(error, "save artifact version");
  }

  async saveCheckpoint(runId: string, cp: CheckpointRecord) {
    const { error } = await supabase().from("checkpoints").upsert({
      run_id: runId,
      id: cp.id,
      seq: cp.seq,
      phase: cp.phase,
      round: cp.round,
      label: cp.label,
      state: cp.state,
    });
    check(error, "save checkpoint");
  }

  async loadResumePoint(runId: string): Promise<ResumePoint> {
    const db = supabase();
    const [checkpoint, last, run] = await Promise.all([
      db.from("checkpoints").select("id, seq, phase, round, label, state").eq("run_id", runId).order("seq", { ascending: false }).limit(1).maybeSingle(),
      db.from("events").select("seq").eq("run_id", runId).order("seq", { ascending: false }).limit(1).maybeSingle(),
      db.from("runs").select("totals").eq("id", runId).maybeSingle(),
    ]);
    check(checkpoint.error, "load checkpoint");
    check(last.error, "load last event");
    const totals = run.data?.totals as Partial<Totals> | null | undefined;
    return {
      checkpoint: (checkpoint.data as CheckpointRecord | null) ?? null,
      lastSeq: last.data?.seq ?? 0,
      totals: totals ? { ...EMPTY_TOTALS, ...totals } : null,
    };
  }
}
