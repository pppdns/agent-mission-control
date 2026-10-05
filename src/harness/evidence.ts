import type { EventBus } from "./events";
import type { RunStore } from "./store";
import type { Source } from "./types";

export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    let out = url.toString();
    if (out.endsWith("/")) out = out.slice(0, -1);
    return out.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Run-local evidence store. Every source an agent can cite lives here and nowhere else. */
export class EvidenceStore {
  private readonly byId = new Map<string, Source>();
  private readonly byUrl = new Map<string, string>();
  private counter = 0;

  constructor(
    private readonly runId: string,
    private readonly bus: EventBus,
    private readonly store: RunStore,
  ) {}

  add(input: Omit<Source, "id">): Source {
    const key = normalizeUrl(input.url);
    const existingId = this.byUrl.get(key);
    if (existingId) {
      const existing = this.byId.get(existingId)!;
      if (input.content.length > existing.content.length) {
        existing.content = input.content;
        existing.via = input.via === "fetch_page" ? "fetch_page" : existing.via;
        void this.store.saveSource(this.runId, existing).catch(() => undefined);
      }
      return existing;
    }
    const source: Source = { ...input, id: `s${++this.counter}` };
    this.byId.set(source.id, source);
    this.byUrl.set(key, source.id);
    this.bus.emit(
      {
        type: "source.added",
        data: {
          source: {
            id: source.id,
            url: source.url,
            title: source.title,
            snippet: source.snippet,
            via: source.via,
            agentId: source.agentId,
            query: source.query,
          },
        },
      },
      source.agentId,
    );
    void this.store.saveSource(this.runId, source).catch(() => undefined);
    return source;
  }

  get(id: string): Source | undefined {
    return this.byId.get(id);
  }

  hasUrl(url: string): boolean {
    return this.byUrl.has(normalizeUrl(url));
  }

  all(): Source[] {
    return [...this.byId.values()];
  }

  validIds(ids: string[]): string[] {
    return [...new Set(ids.filter((id) => this.byId.has(id)))];
  }

  /** Compact listing for prompts: id, title, url and a short excerpt (none when `maxChars` is 0). `only` restricts it to the given ids. */
  digest(maxChars = 420, only?: Set<string>): string {
    const sources = only ? this.all().filter((s) => only.has(s.id)) : this.all();
    if (sources.length === 0) return "(no sources gathered)";
    return sources
      .map((s) => `[${s.id}] ${s.title}\n    ${s.url}${maxChars > 0 ? `\n    ${clip(s.snippet || s.content, maxChars)}` : ""}`)
      .join("\n");
  }

  snapshot(): { sources: Source[]; counter: number } {
    return { sources: this.all().map((s) => ({ ...s })), counter: this.counter };
  }

  restore(state: { sources: Source[]; counter: number }) {
    this.byId.clear();
    this.byUrl.clear();
    for (const s of state.sources) {
      this.byId.set(s.id, { ...s });
      this.byUrl.set(normalizeUrl(s.url), s.id);
    }
    this.counter = state.counter;
  }
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
