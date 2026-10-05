"use client";

import type { AgentView, LlmView, RunView, ToolView } from "@/harness/view";
import type { Selection } from "./selection";
import { formatCost, formatMs, formatTokens, JsonBlock, ModelBadge, Pill, RoleChip, ROLE_META } from "./theme";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="label !text-[9.5px]">{label}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-ink">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-void/50 px-2.5 py-1.5">
      <div className="label !text-[9px]">{label}</div>
      <div className="num text-[13px] text-ink">{value}</div>
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-ink-faint">—</span>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function AgentInspector({ agent, view, onSelect }: { agent: AgentView; view: RunView; onSelect: (s: Selection) => void }) {
  const { info } = agent;
  const sent = view.messages.filter((m) => m.message.from === info.id);
  const received = view.messages.filter((m) => m.message.to === info.id);
  const llmCalls = Object.values(view.llm).filter((l) => l.agentId === info.id);
  const toolCalls = Object.values(view.toolCalls).filter((t) => t.agentId === info.id);
  const name = (id: string) => view.agents[id]?.info.name ?? id;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <RoleChip role={info.role} />
        <ModelBadge provider={info.provider} model={info.model} />
        <Pill tone={agent.status === "completed" ? "good" : agent.status === "failed" ? "bad" : agent.status === "running" ? "signal" : "neutral"}>{agent.status}</Pill>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Tokens" value={formatTokens(agent.inputTokens + agent.outputTokens)} />
        <Stat label="Cost" value={formatCost(agent.costUsd)} />
        <Stat label="LLM calls" value={agent.llmCalls} />
      </div>
      <Field label="Current goal">{info.goal}</Field>
      {info.angle && <Field label="Angle">{info.angle}</Field>}
      <Field label="Model routing">
        <div className="text-[12.5px] text-ink-dim">
          <span className="num text-ink">{info.route}</span> → <span className="num text-ink">{info.model}</span>
          <div className="mt-1">{info.routeReason}</div>
        </div>
      </Field>
      <Field label="Tool permissions">
        {info.tools.length ? (
          <div className="flex flex-wrap gap-1.5">
            {info.tools.map((t) => (
              <Pill key={t} tone="cyan">
                {t}
              </Pill>
            ))}
          </div>
        ) : (
          <span className="text-ink-faint">None. Works from the run&apos;s evidence store.</span>
        )}
      </Field>
      {agent.error && <Field label="Error"><span className="text-coral">{agent.error}</span></Field>}

      {agent.report ? (
        <>
          <div className="label mt-3 border-t border-line pt-3">Structured reasoning</div>
          <Field label="Objective">{agent.report.objective}</Field>
          <Field label="Plan"><List items={agent.report.plan} /></Field>
          <Field label="Rationale">{agent.report.rationale || <span className="text-ink-faint">—</span>}</Field>
          <Field label="Decisions"><List items={agent.report.decisions} /></Field>
          <Field label="Observations"><List items={agent.report.observations} /></Field>
          <Field label="Critiques"><List items={agent.report.critiques} /></Field>
          <Field label="Evidence">
            {agent.report.evidence.length ? (
              <div className="flex flex-wrap gap-1">
                {agent.report.evidence.map((id) => (
                  <button key={id} type="button" onClick={() => onSelect({ type: "source", id })} className="num rounded-sm border border-cyan/30 bg-cyan/10 px-1 text-[10px] text-cyan">
                    {id}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-ink-faint">—</span>
            )}
          </Field>
          <Field label="Next action">{agent.report.nextAction}</Field>
        </>
      ) : (
        <div className="mt-3 rounded-sm border border-dashed border-line px-3 py-2 text-[12px] text-ink-faint">
          The structured report appears when the agent finishes. Raw chain-of-thought is never exposed.
        </div>
      )}

      {agent.notes.length > 0 && (
        <Field label="Notes">
          <List items={agent.notes} />
        </Field>
      )}

      <div className="label mt-3 border-t border-line pt-3">Messages ({sent.length} sent · {received.length} received)</div>
      <ul className="mt-1.5 space-y-1">
        {[...sent, ...received]
          .sort((a, b) => a.seq - b.seq)
          .map((m) => (
            <li key={m.message.id}>
              <button type="button" onClick={() => onSelect({ type: "message", id: m.message.id })} className="w-full rounded-sm px-2 py-1 text-left text-[12px] hover:bg-panel-3">
                <span className="num text-ink-faint">{m.message.from === info.id ? "→" : "←"}</span>{" "}
                <span className="text-ink-dim">{name(m.message.from === info.id ? m.message.to : m.message.from)}</span>{" "}
                <Pill tone={m.message.type === "objection" ? "bad" : "neutral"}>{m.message.type}</Pill>
                <div className="mt-0.5 line-clamp-2 text-ink-dim">{m.message.content}</div>
              </button>
            </li>
          ))}
      </ul>

      <div className="label mt-3 border-t border-line pt-3">LLM calls ({llmCalls.length}) and tool calls ({toolCalls.length})</div>
      <ul className="mt-1.5 space-y-0.5">
        {llmCalls.map((l) => (
          <li key={l.callId}>
            <button type="button" onClick={() => onSelect({ type: "llm", id: l.callId })} className="num w-full rounded-sm px-2 py-1 text-left text-[11.5px] text-ink-dim hover:bg-panel-3">
              ◇ {l.purpose} · {l.model} · {formatTokens(l.inputTokens)}/{formatTokens(l.outputTokens)} · {(l.latencyMs / 1000).toFixed(1)}s
            </button>
          </li>
        ))}
        {toolCalls.map((t) => (
          <li key={t.toolCallId}>
            <button type="button" onClick={() => onSelect({ type: "tool", id: t.toolCallId })} className="num w-full truncate rounded-sm px-2 py-1 text-left text-[11.5px] text-ink-dim hover:bg-panel-3">
              ⚙ {t.tool} · {(t.params as { query?: string; url?: string } | null)?.query ?? (t.params as { url?: string } | null)?.url ?? ""}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function LlmInspector({ call, view }: { call: LlmView; view: RunView }) {
  const agent = view.agents[call.agentId]?.info;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ModelBadge provider={call.provider} model={call.model} />
        <Pill tone={call.status === "done" ? "good" : call.status === "failed" ? "bad" : "signal"}>{call.status}</Pill>
        {agent && <RoleChip role={agent.role} name={agent.name} />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Input tok" value={call.inputTokens.toLocaleString()} />
        <Stat label="Output tok" value={call.outputTokens.toLocaleString()} />
        <Stat label="Cached tok" value={call.cachedTokens.toLocaleString()} />
        <Stat label="Latency" value={`${(call.latencyMs / 1000).toFixed(2)}s`} />
        <Stat label="Cost" value={formatCost(call.costUsd)} />
        <Stat label="Finish" value={call.finishReason ?? "—"} />
      </div>
      {call.status === "running" && call.streamedChars > 0 && (
        <Field label="Streaming">{call.streamedChars.toLocaleString()} characters received so far</Field>
      )}
      <Field label="Purpose">{call.purpose}{call.step ? ` (step ${call.step})` : ""}</Field>
      <Field label="Routing reason">
        <span className="num">{call.route}</span> → <span className="num">{call.model}</span>
        <div className="mt-1 text-[12.5px] text-ink-dim">{agent?.routeReason}</div>
      </Field>
      <Field label="Prompt size">{call.messageCount} messages · {call.promptChars.toLocaleString()} characters</Field>
      {call.error && <Field label="Error"><span className="text-coral">{call.error}</span></Field>}
      {call.text && <Field label="Text output"><JsonBlock value={call.text} /></Field>}
      {call.toolCalls.length > 0 && <Field label="Tool calls requested"><JsonBlock value={call.toolCalls} /></Field>}
      {call.structured !== null && <Field label="Structured output"><JsonBlock value={call.structured} /></Field>}
    </>
  );
}

function ToolInspector({ call, view }: { call: ToolView; view: RunView }) {
  const agent = view.agents[call.agentId]?.info;
  const manifest = view.tools.find((t) => t.name === call.tool);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={call.status === "done" ? "good" : call.status === "failed" ? "bad" : "signal"}>{call.status}</Pill>
        {agent && <RoleChip role={agent.role} name={agent.name} />}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Tool" value={call.tool} />
        <Stat label="Duration" value={`${(call.durationMs / 1000).toFixed(2)}s`} />
        <Stat label="Attempts" value={Math.max(1, call.attempts)} />
      </div>
      <Field label="MCP server"><span className="num">{call.server ?? "internal"}{call.mcpTool ? ` / ${call.mcpTool}` : ""}</span></Field>
      <Field label="Parameters"><JsonBlock value={call.params} /></Field>
      {call.errors.length > 0 && (
        <Field label="Failures / retry information">
          <List items={call.errors} />
        </Field>
      )}
      {call.resultPreview && <Field label={`Result (${call.resultChars.toLocaleString()} chars)`}><JsonBlock value={call.resultPreview} max={3500} /></Field>}
      {call.sourceIds.length > 0 && <Field label="Sources registered"><span className="num">{call.sourceIds.join(", ")}</span></Field>}
      {manifest && <Field label="Input schema (from the MCP server)"><JsonBlock value={manifest.inputSchema} max={2500} /></Field>}
    </>
  );
}

export function Inspector({ view, selection, onSelect, onClose }: { view: RunView; selection: Selection; onSelect: (s: Selection) => void; onClose: () => void }) {
  if (!selection) return null;
  const name = (id: string) => view.agents[id]?.info.name ?? id;

  let title = "";
  let body: React.ReactNode = null;

  if (selection?.type === "agent" && view.agents[selection.id]) {
    const agent = view.agents[selection.id];
    title = agent.info.name;
    body = <AgentInspector agent={agent} view={view} onSelect={onSelect} />;
  } else if (selection?.type === "llm" && view.llm[selection.id]) {
    title = "LLM call";
    body = <LlmInspector call={view.llm[selection.id]} view={view} />;
  } else if (selection?.type === "tool" && view.toolCalls[selection.id]) {
    title = "Tool call";
    body = <ToolInspector call={view.toolCalls[selection.id]} view={view} />;
  } else if (selection?.type === "message" || selection?.type === "pair") {
    const messages =
      selection.type === "message"
        ? view.messages.filter((m) => m.message.id === selection.id)
        : view.messages.filter((m) => [m.message.from, m.message.to].sort().join("|") === [selection.a, selection.b].sort().join("|"));
    title = selection.type === "pair" ? `${name(selection.a)} ⇄ ${name(selection.b)}` : "Agent message";
    body = (
      <ul className="space-y-3">
        {[...messages].reverse().map((m) => (
          <li key={m.message.id} className="rounded-sm border border-line bg-void/50 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span style={{ color: view.agents[m.message.from] ? ROLE_META[view.agents[m.message.from].info.role].color : undefined }}>{name(m.message.from)}</span>
              <span className="text-ink-faint">→</span>
              <span style={{ color: view.agents[m.message.to] ? ROLE_META[view.agents[m.message.to].info.role].color : undefined }}>{name(m.message.to)}</span>
              <Pill tone={m.message.type === "objection" ? "bad" : "neutral"}>{m.message.type}</Pill>
              <span className="num ml-auto text-[10.5px] text-ink-faint">{formatMs(m.ts - (view.startTs ?? m.ts))}</span>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink">{m.message.content}</p>
            {m.message.refs.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.message.refs.map((id) => (
                  <button key={id} type="button" onClick={() => onSelect({ type: "source", id })} className="num rounded-sm border border-cyan/30 bg-cyan/10 px-1 text-[10px] text-cyan">
                    {id}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  } else if (selection?.type === "source" && view.sources[selection.id]) {
    const s = view.sources[selection.id];
    title = `Source ${s.id}`;
    body = (
      <>
        <Field label="Title">{s.title}</Field>
        <Field label="URL">
          <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="num break-all text-[12px] text-cyan underline decoration-cyan/30 underline-offset-2 hover:decoration-cyan">
            {s.url}
          </a>
        </Field>
        <Field label="Retrieved via">{s.via === "fetch_page" ? "Page fetch (Firecrawl MCP)" : `Web search (Tavily MCP)${s.query ? `: “${s.query}”` : ""}`}</Field>
        <Field label="Found by">{name(s.agentId)}</Field>
        <Field label="Excerpt">{s.snippet || "—"}</Field>
      </>
    );
  } else {
    return null;
  }

  return (
    <aside className="anim-slide hud absolute inset-y-0 right-0 z-30 flex w-full max-w-[26rem] flex-col shadow-[-24px_0_48px_-12px_rgba(0,0,0,0.7)] sm:inset-y-2 sm:right-2" aria-label={`${title} inspector`}>
      <div className="panel-title shrink-0">
        <span className="label !text-ink-dim">Inspector</span>
        <span className="truncate text-[12.5px] text-ink">{title}</span>
        <button type="button" onClick={onClose} className="ml-auto rounded-sm px-1.5 text-ink-faint transition hover:text-ink" aria-label="Close inspector">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{body}</div>
    </aside>
  );
}
