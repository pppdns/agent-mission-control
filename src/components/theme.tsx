import type { AgentRole, Provider } from "@/harness/types";

export const ROLE_META: Record<AgentRole, { label: string; color: string; glyph: string }> = {
  orchestrator: { label: "Orchestrator", color: "#e8f1ff", glyph: "◎" },
  researcher: { label: "Researcher", color: "#4fd1e6", glyph: "⌕" },
  skeptic: { label: "Skeptic", color: "#ff6b5a", glyph: "⚑" },
  evidence_verifier: { label: "Verifier", color: "#9be564", glyph: "✓" },
  evaluator: { label: "Gap Detector", color: "#c792ea", glyph: "⌖" },
  editor: { label: "Editor", color: "#ffb547", glyph: "✎" },
};

export const PROVIDER_COLOR: Record<Provider, string> = {
  openai: "#4ee0b5",
  anthropic: "#f0986f",
};

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTokens(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}k`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

export function ModelBadge({ provider, model, className = "" }: { provider: Provider; model: string; className?: string }) {
  const color = PROVIDER_COLOR[provider];
  return (
    <span
      className={`num inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-[1px] text-[10px] leading-4 ${className}`}
      style={{ borderColor: `${color}55`, color, background: `${color}10` }}
      title={`${provider} · ${model}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {model}
    </span>
  );
}

export function RoleChip({ role, name }: { role: AgentRole; name?: string }) {
  const meta = ROLE_META[role];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: meta.color }}>
      <span aria-hidden>{meta.glyph}</span>
      <span>{name ?? meta.label}</span>
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "signal" | "cyan";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "border-line-bright text-ink-dim",
    good: "border-lime/40 text-lime bg-lime/10",
    warn: "border-signal/40 text-signal bg-signal/10",
    bad: "border-coral/40 text-coral bg-coral/10",
    signal: "border-signal/50 text-signal bg-signal/10",
    cyan: "border-cyan/40 text-cyan bg-cyan/10",
  };
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-[1px] !text-[10px] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function JsonBlock({ value, max = 6000 }: { value: unknown; max?: number }) {
  let text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (text === undefined || text === null) text = "null";
  const clipped = text.length > max ? `${text.slice(0, max)}\n… ${text.length - max} more characters` : text;
  return (
    <pre className="num max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-sm border border-line bg-void/70 p-2.5 text-[11px] leading-relaxed text-ink-dim">
      {clipped}
    </pre>
  );
}
