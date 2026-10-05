import { describe, expect, it } from "vitest";
import { decideNext, ENOUGH_SCORE, scoreRubric, type DecisionInput } from "@/harness/evaluator";

const gap = { question: "What does the 2025 RCT say?", angle: "clinical trials", why: "No primary evidence yet" };

function input(overrides: Partial<Omit<DecisionInput, "assessment">> & { assessment?: Partial<DecisionInput["assessment"]> } = {}): DecisionInput {
  const { assessment, ...rest } = overrides;
  return {
    assessment: { score: 5, enoughEvidence: false, gaps: [gap], conflict: null, ...assessment },
    round: 1,
    maxLoops: 1,
    hitlCount: 0,
    maxHitl: 1,
    askedConflict: false,
    canAffordLoop: true,
    extensionUsed: false,
    ...rest,
  };
}

describe("scoreRubric", () => {
  it("maps three 0-5 scores onto 0-10 with one decimal", () => {
    expect(scoreRubric({ coverage: 5, support: 5, balance: 5 })).toBe(10);
    expect(scoreRubric({ coverage: 3, support: 3, balance: 4 })).toBe(6.7);
    expect(scoreRubric({ coverage: 0, support: 0, balance: 0 })).toBe(0);
  });
});

describe("decideNext", () => {
  it("synthesizes when there are no gaps", () => {
    expect(decideNext(input({ assessment: { gaps: [] } })).decision).toBe("synthesize");
  });

  it("synthesizes when the evidence is judged enough and the score clears the bar", () => {
    expect(decideNext(input({ assessment: { enoughEvidence: true, score: ENOUGH_SCORE } })).decision).toBe("synthesize");
  });

  it("loops when the score is enough but the evaluator still wants evidence", () => {
    expect(decideNext(input({ assessment: { enoughEvidence: false, score: 8 } })).decision).toBe("loop");
  });

  it("stops looping past the loop limit", () => {
    const d = decideNext(input({ round: 2, maxLoops: 1 }));
    expect(d.decision).toBe("synthesize");
    expect(d.reason).toMatch(/loop limit/);
  });

  it("asks the visitor about a conflict once, then loops", () => {
    const first = decideNext(input({ assessment: { conflict: "Two meta-analyses disagree" } }));
    expect(first).toMatchObject({ decision: "ask_human", hitl: "conflict" });
    const again = decideNext(input({ assessment: { conflict: "Two meta-analyses disagree" }, askedConflict: true }));
    expect(again.decision).toBe("loop");
  });

  it("does not ask when the approval allowance is spent", () => {
    expect(decideNext(input({ assessment: { conflict: "x" }, hitlCount: 1 })).decision).toBe("loop");
    expect(decideNext(input({ canAffordLoop: false, hitlCount: 1 })).decision).toBe("synthesize");
  });

  it("offers a budget extension when a loop is unaffordable, only once", () => {
    expect(decideNext(input({ canAffordLoop: false }))).toMatchObject({ decision: "ask_human", hitl: "budget" });
    expect(decideNext(input({ canAffordLoop: false, extensionUsed: true })).decision).toBe("synthesize");
  });
});
