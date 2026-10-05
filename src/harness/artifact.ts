import type { EventBus } from "./events";
import type { EvidenceStore } from "./evidence";
import type { RunStore } from "./store";
import type {
  Artifact,
  ArtifactBlock,
  ArtifactSection,
  BlockComment,
  BlockKind,
  Confidence,
  SectionId,
  SectionStatus,
  Verdict,
} from "./types";
import { SECTION_ORDER, SECTION_TITLES } from "./types";

export interface BlockInput {
  kind: BlockKind;
  text: string;
  sourceIds: string[];
  confidence: Confidence | null;
}

/** Versioned, typed-block shared document. Every mutation creates a new version and an event. */
export class ArtifactManager {
  private artifact: Artifact;
  private blockCounter = 0;
  private commentCounter = 0;
  private pending: Promise<unknown>[] = [];

  constructor(
    private readonly runId: string,
    private readonly bus: EventBus,
    private readonly store: RunStore,
    private readonly evidence: EvidenceStore,
  ) {
    this.artifact = {
      version: 0,
      title: "Untitled brief",
      sections: SECTION_ORDER.map((id) => ({
        id,
        title: SECTION_TITLES[id],
        status: "empty" as SectionStatus,
        blocks: [],
        updatedBy: null,
        updatedAtVersion: 0,
      })),
    };
  }

  get version() {
    return this.artifact.version;
  }

  create(title: string, authorId: string) {
    this.artifact.title = title;
    this.bus.emit({ type: "artifact.created", data: { artifact: structuredClone(this.artifact) } }, authorId);
    this.persist(authorId, "Artifact created");
  }

  setTitle(title: string, author: string) {
    if (!title.trim() || title === this.artifact.title) return;
    this.artifact.title = title.trim();
    this.artifact.version += 1;
    this.bus.emit(
      {
        type: "artifact.updated",
        data: { version: this.artifact.version, change: "title", summary: "Brief titled", title: this.artifact.title, section: null },
      },
      author,
    );
    this.persist(author, "Brief titled");
  }

  section(id: SectionId): ArtifactSection {
    return this.artifact.sections.find((s) => s.id === id)!;
  }

  snapshot(): Artifact {
    return structuredClone(this.artifact);
  }

  findBlock(blockId: string): { section: ArtifactSection; block: ArtifactBlock } | null {
    for (const section of this.artifact.sections) {
      const block = section.blocks.find((b) => b.id === blockId);
      if (block) return { section, block };
    }
    return null;
  }

  makeBlock(input: BlockInput, author: string): ArtifactBlock {
    return {
      id: `b${++this.blockCounter}`,
      kind: input.kind,
      text: input.text.trim(),
      sourceIds: this.evidence.validIds(input.sourceIds),
      confidence: input.confidence,
      verdict: "unchecked",
      author,
      comments: [],
    };
  }

  append(sectionId: SectionId, inputs: BlockInput[], author: string, summary: string): ArtifactBlock[] {
    const section = this.section(sectionId);
    const blocks = inputs.filter((i) => i.text.trim()).map((i) => this.makeBlock(i, author));
    if (blocks.length === 0) return [];
    section.blocks.push(...blocks);
    section.status = "drafting";
    this.commit(section, "append", summary, author);
    return blocks;
  }

  rewrite(sectionId: SectionId, inputs: BlockInput[], author: string, status: SectionStatus, summary: string) {
    const section = this.section(sectionId);
    section.blocks = inputs.filter((i) => i.text.trim()).map((i) => this.makeBlock(i, author));
    section.status = status;
    this.commit(section, "rewrite", summary, author);
  }

  setSectionStatus(sectionId: SectionId, status: SectionStatus, author: string, summary: string) {
    const section = this.section(sectionId);
    if (section.status === status) return;
    section.status = status;
    this.commit(section, "annotate", summary, author);
  }

  annotate(
    blockId: string,
    author: string,
    patch: { verdict?: Verdict; comment?: Omit<BlockComment, "id" | "author"> },
    summary: string,
  ): boolean {
    const found = this.findBlock(blockId);
    if (!found) return false;
    if (patch.verdict) found.block.verdict = patch.verdict;
    if (patch.comment) {
      found.block.comments.push({ ...patch.comment, id: `c${++this.commentCounter}`, author });
    }
    if (found.section.status === "final") found.section.status = "reviewing";
    else if (found.section.status === "drafting") found.section.status = "reviewing";
    this.commit(found.section, "annotate", summary, author);
    return true;
  }

  /** Text rendering with stable block ids, used inside agent prompts. */
  render(opts: { onlySections?: SectionId[] } = {}): string {
    const lines: string[] = [];
    for (const section of this.artifact.sections) {
      if (opts.onlySections && !opts.onlySections.includes(section.id)) continue;
      if (section.blocks.length === 0) continue;
      lines.push(`## ${section.title}`);
      for (const block of section.blocks) {
        const cites = block.sourceIds.length ? ` [${block.sourceIds.join(", ")}]` : "";
        const conf = block.confidence ? ` (confidence: ${block.confidence})` : "";
        const verdict = block.verdict !== "unchecked" ? ` {verdict: ${block.verdict}}` : "";
        lines.push(`- (${block.id}) ${block.text}${cites}${conf}${verdict}`);
        for (const c of block.comments) {
          lines.push(`    ↳ ${c.kind}${c.severity ? `/${c.severity}` : ""}: ${c.text}`);
        }
      }
    }
    return lines.length ? lines.join("\n") : "(artifact is still empty)";
  }

  async settle() {
    await Promise.allSettled(this.pending);
    this.pending = [];
  }

  private commit(section: ArtifactSection, change: "append" | "rewrite" | "annotate", summary: string, author: string) {
    this.artifact.version += 1;
    section.updatedBy = author;
    section.updatedAtVersion = this.artifact.version;
    this.bus.emit(
      {
        type: "artifact.updated",
        data: {
          version: this.artifact.version,
          change,
          summary,
          title: null,
          section: structuredClone(section),
        },
      },
      author,
    );
    this.persist(author, summary);
  }

  private persist(author: string, summary: string) {
    this.pending.push(
      this.store.saveArtifactVersion(this.runId, structuredClone(this.artifact), author, summary).catch(() => undefined),
    );
  }
}
