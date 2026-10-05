"use client";

import { useState } from "react";
import type { ArtifactBlock, ArtifactSection, SectionStatus, Verdict } from "@/harness/types";
import type { RunView } from "@/harness/view";
import type { Selection } from "./selection";
import { Pill, ROLE_META } from "./theme";

const STATUS: Record<SectionStatus, { label: string; color: string }> = {
  empty: { label: "waiting", color: "#5a6878" },
  drafting: { label: "editing…", color: "#ffb547" },
  reviewing: { label: "under review", color: "#4fd1e6" },
  final: { label: "final", color: "#9be564" },
};

const VERDICT: Record<Exclude<Verdict, "unchecked">, { label: string; color: string; glyph: string }> = {
  supported: { label: "supported", color: "#9be564", glyph: "✓" },
  weak: { label: "weak", color: "#ffb547", glyph: "~" },
  unsupported: { label: "unsupported", color: "#ff6b5a", glyph: "✕" },
};

function Citations({ ids, view, onSelect }: { ids: string[]; view: RunView; onSelect: (s: Selection) => void }) {
  if (ids.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-baseline">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          title={view.sources[id]?.title ?? id}
          onClick={() => onSelect({ type: "source", id })}
          className="num rounded-sm border border-cyan/30 bg-cyan/10 px-1 text-[10px] leading-4 text-cyan transition hover:border-cyan hover:bg-cyan/20"
        >
          {id}
        </button>
      ))}
    </span>
  );
}

function Block({ block, view, onSelect }: { block: ArtifactBlock; view: RunView; onSelect: (s: Selection) => void }) {
  const author = view.agents[block.author]?.info;
  const verdict = block.verdict !== "unchecked" ? VERDICT[block.verdict] : null;
  return (
    <li className="group relative pl-4">
      <span className="absolute left-0 top-[0.62em] h-1 w-1 rounded-full" style={{ background: author ? ROLE_META[author.role].color : "#5a6878" }} />
      <div className="text-[13.5px] leading-[1.6] text-ink">
        {block.text}
        <Citations ids={block.sourceIds} view={view} onSelect={onSelect} />
        {block.confidence && block.confidence !== "high" && (
          <span className="num ml-1.5 text-[10px] uppercase tracking-wider text-ink-faint">{block.confidence} conf.</span>
        )}
        {verdict && (
          <span
            className="num ml-1.5 inline-flex items-center gap-1 rounded-sm border px-1 text-[10px] uppercase tracking-wider"
            style={{ color: verdict.color, borderColor: `${verdict.color}55`, background: `${verdict.color}12` }}
          >
            {verdict.glyph} {verdict.label}
          </span>
        )}
      </div>
      {block.comments.map((c) => {
        const commenter = view.agents[c.author]?.info;
        const color = c.kind === "objection" ? "#ff6b5a" : c.kind === "verification" ? "#9be564" : "#8896a6";
        return (
          <div key={c.id} className="mt-1 border-l-2 pl-2.5 text-[12px] leading-relaxed text-ink-dim" style={{ borderColor: `${color}88` }}>
            <span className="label !text-[9.5px]" style={{ color }}>
              {commenter?.name ?? c.author} · {c.kind}
              {c.severity ? ` · ${c.severity}` : ""}
            </span>
            <div>{c.text}</div>
          </div>
        );
      })}
    </li>
  );
}

function Section({ section, view, live, onSelect }: { section: ArtifactSection; view: RunView; live: boolean; onSelect: (s: Selection) => void }) {
  const status = STATUS[section.status];
  const editor = section.updatedBy ? view.agents[section.updatedBy]?.info : null;
  return (
    <section key={section.id} className="border-b border-line/70 px-4 py-3.5 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <h3 className="font-display text-[15px] font-semibold uppercase tracking-[0.1em] text-ink">{section.title}</h3>
        <span className="num flex items-center gap-1.5 text-[10px] uppercase tracking-wider" style={{ color: status.color }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: status.color, animation: section.status === "drafting" ? "blink 0.9s infinite" : undefined }}
          />
          {status.label}
        </span>
        {editor && section.status !== "empty" && (
          <span className="ml-auto text-[10.5px]" style={{ color: ROLE_META[editor.role].color }}>
            {editor.name}
          </span>
        )}
      </div>
      <div key={section.updatedAtVersion} className={live && section.updatedAtVersion > 0 ? "anim-flash -mx-4 px-4" : "-mx-4 px-4"}>
        {section.blocks.length > 0 ? (
          <ul className="mt-2 space-y-2.5">
            {section.blocks.map((b) => (
              <Block key={b.id} block={b} view={view} onSelect={onSelect} />
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            {section.status === "drafting" ? <div className="shimmer-line h-[3px] w-40 rounded" /> : <div className="h-[3px] w-12 rounded bg-line" />}
          </div>
        )}
      </div>
    </section>
  );
}

type Tab = "brief" | "sources" | "history";

export function ArtifactPanel({ view, onSelect }: { view: RunView; onSelect: (s: Selection) => void }) {
  const [tab, setTab] = useState<Tab>("brief");
  const artifact = view.artifact;
  const live = view.phase === "running";
  const tabs: [Tab, string][] = [
    ["brief", "Brief"],
    ["sources", `Sources · ${view.sourceOrder.length}`],
    ["history", `Versions · ${artifact?.version ?? 0}`],
  ];

  return (
    <div className="hud flex h-full min-h-0 flex-col">
      <div className="panel-title">
        <span className="label !text-ink-dim">Live artifact</span>
        <span className="num text-[11px] text-signal">v{artifact?.version ?? 0}</span>
        <div className="ml-auto flex gap-1">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`label rounded-sm px-2 py-[3px] !text-[10px] transition ${tab === id ? "bg-panel-3 !text-ink" : "hover:!text-ink-dim"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "brief" && (
          <>
            {artifact ? (
              <>
                <div className="border-b border-line/70 px-4 py-3">
                  <h2 className="text-[17px] font-semibold leading-snug text-ice">{artifact.title}</h2>
                  <div className="num mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] uppercase tracking-wider">
                    {artifact.sections.map((s) => (
                      <span key={s.id} className="flex items-center gap-1" style={{ color: STATUS[s.status].color }}>
                        <span>{s.status === "final" ? "✓" : s.status === "empty" ? "○" : "●"}</span>
                        <span className="text-ink-faint">{s.title}</span>
                      </span>
                    ))}
                  </div>
                </div>
                {artifact.sections.map((s) => (
                  <Section key={s.id} section={s} view={view} live={live} onSelect={onSelect} />
                ))}
              </>
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center px-6 text-center text-[13px] text-ink-faint">
                {view.phase === "declined"
                  ? "No brief: the prompt was declined."
                  : view.phase === "failed"
                    ? "The run failed before the brief was opened."
                    : "The brief opens once the Orchestrator has planned the mission…"}
              </div>
            )}
          </>
        )}

        {tab === "sources" && (
          <ul className="divide-y divide-line/70">
            {view.sourceOrder.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-faint">No sources gathered yet.</li>}
            {view.sourceOrder.map((id) => {
              const s = view.sources[id];
              const agent = view.agents[s.agentId]?.info;
              return (
                <li key={id} className="anim-row px-4 py-2.5">
                  <button type="button" onClick={() => onSelect({ type: "source", id })} className="w-full text-left">
                    <div className="flex items-center gap-2">
                      <span className="num rounded-sm border border-cyan/30 bg-cyan/10 px-1 text-[10px] text-cyan">{id}</span>
                      <span className="truncate text-[13px] text-ink">{s.title}</span>
                      <Pill className="ml-auto shrink-0">{s.via === "fetch_page" ? "page fetch" : "search"}</Pill>
                    </div>
                    <div className="num mt-0.5 truncate text-[10.5px] text-ink-faint">{s.url}</div>
                    {agent && <div className="mt-0.5 text-[10.5px]" style={{ color: ROLE_META[agent.role].color }}>found by {agent.name}</div>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {tab === "history" && (
          <ol className="px-4 py-3">
            {[...view.artifactLog].reverse().map((entry) => {
              const agent = entry.agentId ? view.agents[entry.agentId]?.info : null;
              return (
                <li key={entry.version} className="flex items-baseline gap-3 border-b border-line/50 py-1.5 last:border-0">
                  <span className="num w-8 shrink-0 text-[11px] text-signal">v{entry.version}</span>
                  <span className="text-[12.5px] text-ink-dim">{entry.summary}</span>
                  {agent && (
                    <span className="ml-auto shrink-0 text-[10.5px]" style={{ color: ROLE_META[agent.role].color }}>
                      {agent.name}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
