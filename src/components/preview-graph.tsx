import type { MomentKind, RunPreview } from "@/harness/preview";
import { PULSE_MS, VIEW_H, VIEW_W, VISITOR_NODE, type Layout, type LayoutNode, type Schedule } from "./preview-layout";
import { ROLE_META } from "./theme";

const VISITOR_META = { label: "Visitor", color: "#ff6b5a", glyph: "?" };
const APPEAR_MS = 320;
const FINISH_PULSE_MS = 900;
const R = 15;

const KIND_COLOR: Partial<Record<MomentKind, string>> = {
  objection: "#ff6b5a",
  loop: "#c792ea",
  hitl: "#ff6b5a",
  search: "#4fd1e6",
  fetch: "#9be564",
  evaluate: "#c792ea",
  compact: "#ffb547",
};

const metaOf = (n: LayoutNode) => (n.role === "visitor" ? VISITOR_META : ROLE_META[n.role]);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (p: number) => 1 - (1 - p) ** 3;

function labelLines(name: string, max: number): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if (`${line} ${w}`.length <= max) line = `${line} ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) lines.splice(1, lines.length - 1, `${lines.slice(1).join(" ").slice(0, max - 1)}…`);
  return lines.map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}

/**
 * SVG rendering of a run preview. With `time` set it renders that instant of the reel
 * (nodes appearing, message pulses, activity rings); with `time` null it renders the final team.
 */
export function PreviewGraph({
  preview,
  layout,
  schedule,
  time,
  className = "",
  labelChars = 16,
  showLabels = true,
}: {
  preview: RunPreview;
  layout: Layout;
  schedule: Schedule | null;
  time: number | null;
  className?: string;
  labelChars?: number;
  showLabels?: boolean;
}) {
  const live = time !== null && schedule !== null;
  const t = time ?? Number.POSITIVE_INFINITY;
  const shown = (id: string) => (live ? clamp01((t - (schedule.appear.get(id) ?? 0)) / APPEAR_MS) : 1);

  const activeMoments = live ? schedule.moments.filter((s) => t >= s.start && t < s.start + PULSE_MS) : [];
  const busy = new Set<string>();
  if (live) {
    for (const s of schedule.moments) {
      if (t < s.start || t > s.start + PULSE_MS + 250) continue;
      if (s.moment.from) busy.add(s.moment.from);
      for (const id of s.moment.to) busy.add(id);
    }
  }
  const finishing = live && t >= schedule.doneAt;
  const finishP = finishing ? clamp01((t - schedule.doneAt) / FINISH_PULSE_MS) : 0;
  const editor = layout.nodes.find((n) => n.role === "editor");
  const r = showLabels ? R : 21;

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className={className} role="img" aria-label={`Agent team for: ${preview.title}`}>
      {layout.edges.map((e) => {
        const a = layout.byId.get(e.from);
        const b = layout.byId.get(e.to);
        if (!a || !b) return null;
        const o = Math.min(shown(e.from), shown(e.to));
        if (o <= 0) return null;
        return <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={showLabels ? "#2b3a49" : "#3a4d60"} strokeWidth={showLabels ? 1.1 : 1.6} strokeDasharray="3 4" opacity={o} />;
      })}

      {activeMoments.flatMap((s, i) => {
        const from = s.moment.from ? layout.byId.get(s.moment.from) : null;
        if (!from) return [];
        const p = ease((t - s.start) / PULSE_MS);
        const color = KIND_COLOR[s.moment.kind] ?? metaOf(from).color;
        const targets = s.moment.to.map((id) => layout.byId.get(id)).filter((n): n is LayoutNode => !!n && n.id !== from.id);
        if (targets.length === 0) {
          return [<circle key={`ring-${i}`} cx={from.x} cy={from.y} r={R + 16 * p} fill="none" stroke={color} strokeWidth="1.4" opacity={1 - p} />];
        }
        return targets.map((to) => (
          <circle
            key={`pulse-${i}-${to.id}`}
            cx={from.x + (to.x - from.x) * p}
            cy={from.y + (to.y - from.y) * p}
            r="3.6"
            fill={color}
            style={{ filter: `drop-shadow(0 0 5px ${color})` }}
          />
        ));
      })}

      {finishing &&
        editor &&
        finishP < 1 &&
        layout.nodes
          .filter((n) => n.id !== editor.id && n.id !== VISITOR_NODE)
          .map((n) => {
            const p = ease(finishP);
            return (
              <circle key={`fin-${n.id}`} cx={n.x + (editor.x - n.x) * p} cy={n.y + (editor.y - n.y) * p} r="3" fill={metaOf(n).color} opacity={1 - p * 0.6} />
            );
          })}

      {layout.nodes.map((n) => {
        const o = shown(n.id);
        if (o <= 0) return null;
        const meta = metaOf(n);
        const active = busy.has(n.id) || (finishing && n.id === editor?.id);
        const scale = 0.6 + 0.4 * ease(o);
        const lines = showLabels ? labelLines(n.name, labelChars) : [];
        return (
          <g key={n.id} opacity={o} transform={`translate(${n.x} ${n.y}) scale(${scale})`}>
            {active && <circle r={r + 6} fill={meta.color} opacity="0.14" />}
            <circle r={r} fill="#0b0f14" stroke={meta.color} strokeWidth={active ? 2 : 1.1} style={active ? { filter: `drop-shadow(0 0 6px ${meta.color})` } : undefined} />
            <text y={r * 0.3} textAnchor="middle" fontSize={r * 0.87} fill={meta.color}>
              {meta.glyph}
            </text>
            {lines.map((line, i) => (
              <text key={i} y={R + 13 + i * 11} textAnchor="middle" fontSize="10" fill={active ? "#dce4ec" : "#8896a6"}>
                {line}
              </text>
            ))}
          </g>
        );
      })}
    </svg>
  );
}
