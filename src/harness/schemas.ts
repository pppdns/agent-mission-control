import { z } from "zod";
import { MESSAGE_TYPES, SECTION_ORDER } from "./types";

const messageType = z.enum(MESSAGE_TYPES as [string, ...string[]]);
const confidence = z.enum(["high", "medium", "low"]);

export const outboundMessage = z.object({
  to: z.string().describe("Name of the teammate this message is for (e.g. the Editor or a critic)"),
  type: messageType,
  content: z.string().describe("One or two sentences, specific and self-contained"),
});

const reasoning = {
  objective: z.string().describe("What you set out to accomplish, one sentence"),
  plan: z.array(z.string()).describe("The steps you followed, 2-4 short items"),
  rationale: z.string().describe("Why you approached it this way, 1-2 sentences"),
  decisions: z.array(z.string()).describe("Key judgment calls you made"),
  observations: z.array(z.string()).describe("What you noticed along the way"),
  critiques: z.array(z.string()).describe("Weaknesses in the evidence or in your own work"),
  nextAction: z.string().describe("What should happen next"),
  messages: z.array(outboundMessage).describe("Messages to teammates; at least one"),
};

export const researcherReport = z.object({
  ...reasoning,
  findings: z
    .array(
      z.object({
        claim: z.string().describe("A specific, checkable claim, with numbers where available"),
        sourceIds: z.array(z.string()).describe("Source ids like s3 that support the claim"),
        confidence,
        section: z.enum(["key_findings", "evidence", "arguments"]),
      }),
    )
    .describe("3-6 findings backed by sources you actually retrieved"),
  openQuestions: z.array(z.string()).describe("Things you could not resolve"),
});
export type ResearcherReport = z.infer<typeof researcherReport>;

export const skepticReport = z.object({
  ...reasoning,
  objections: z
    .array(
      z.object({
        targetBlockId: z.string().nullable().describe("Block id like b4 this objection targets, or null if general"),
        objection: z.string().describe("The strongest form of the objection"),
        severity: z.enum(["minor", "major"]),
        sourceIds: z.array(z.string()),
        section: z.enum(["counterarguments", "risks", "open_questions"]),
      }),
    )
    .describe("2-5 substantive objections"),
});
export type SkepticReport = z.infer<typeof skepticReport>;

export const verifierReport = z.object({
  ...reasoning,
  verdicts: z
    .array(
      z.object({
        blockId: z.string().describe("Block id like b4"),
        verdict: z.enum(["supported", "weak", "unsupported"]),
        note: z.string().describe("Why, quoting or paraphrasing the source text"),
        sourceIds: z.array(z.string()),
      }),
    )
    .describe("Verdicts for the 4-8 most important claims"),
});
export type VerifierReport = z.infer<typeof verifierReport>;

export const editorOutput = z.object({
  title: z.string().describe("A specific brief title"),
  sections: z
    .array(
      z.object({
        id: z.enum(SECTION_ORDER as [string, ...string[]]),
        blocks: z.array(
          z.object({
            kind: z.enum(["text", "claim", "bullet"]),
            text: z.string(),
            sourceIds: z.array(z.string()),
            confidence: confidence.nullable(),
          }),
        ),
      }),
    )
    .describe("All eight sections in canonical order"),
  objective: z.string(),
  rationale: z.string(),
  decisions: z.array(z.string()),
  critiques: z.array(z.string()).describe("Remaining weaknesses of the final brief"),
  nextAction: z.string(),
  messages: z.array(outboundMessage),
});
export type EditorOutput = z.infer<typeof editorOutput>;

export const planOutput = z.object({
  classification: z.object({
    taskClass: z.enum(["research", "comparison", "decision", "out_of_scope"]),
    reframedPrompt: z
      .string()
      .nullable()
      .describe("If the prompt was out of scope but reasonably reframable, the reframed in-scope question; otherwise null"),
    declineReason: z.string().nullable().describe("If taskClass is out_of_scope and cannot be reframed, a short polite reason"),
    rationale: z.string(),
  }),
  briefTitle: z.string(),
  objective: z.string().describe("The mission objective in one sentence"),
  keyQuestions: z.array(z.string()).describe("2-5 questions the team must answer"),
  approach: z.string().describe("Why this team shape suits the task, 1-2 sentences"),
  plan: z.array(z.string()).describe("3-5 high-level steps"),
  decisions: z.array(z.string()).describe("Notable orchestration decisions, e.g. why N researchers"),
  team: z
    .array(
      z.object({
        role: z.enum(["researcher", "skeptic", "evidence_verifier"]),
        name: z.string().describe("Short distinct name, e.g. 'Cost Researcher'"),
        goal: z.string().describe("This agent's concrete goal in one or two sentences"),
        angle: z.string().nullable().describe("For researchers: the specific angle or sub-question they own"),
      }),
    )
    .describe("2-4 working agents. At least one researcher and at least one of skeptic / evidence_verifier. Empty when declining."),
});
export type PlanOutput = z.infer<typeof planOutput>;
