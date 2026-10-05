import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

type Event = { seq: number; ts: number; type: string; agentId: string | null; data: unknown; runId: string };

const LOG = JSON.parse(readFileSync(join(process.cwd(), "tests/fixtures/run-loop.json"), "utf8")) as Event[];

function sse(events: Event[], end: boolean): string {
  const body = events.map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  return end ? `${body}event: end\ndata: {"status":"completed"}\n\n` : `retry: 60000\n${body}`;
}

async function serveRun(page: Page, runId: string, events: Event[], end: boolean) {
  await page.route(`**/api/runs/${runId}/events`, (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(events, end) }),
  );
}

test("landing page offers a prompt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /mission control/i }).or(page.getByRole("heading").first())).toBeVisible();
  await expect(page.locator("textarea")).toBeVisible();
});

test("replays a recorded run with milestones, speed and jump-to-event", async ({ page }) => {
  await serveRun(page, "fixture-loop", LOG, true);
  await page.goto("/run/fixture-loop?play=1");

  const controls = page.getByLabel("Replay controls");
  await expect(controls).toBeVisible();
  await expect(controls.getByRole("button", { name: "Pause replay" })).toBeVisible();
  await expect(controls.getByText("recorded")).toBeVisible();

  await controls.getByRole("button", { name: "4×" }).click();
  await expect(controls.getByRole("button", { name: "4×" })).toHaveAttribute("aria-pressed", "true");

  await expect(controls.getByRole("button", { name: "Jump to: Round 2" })).toHaveCount(1);
  await controls.getByRole("button", { name: "Jump to: Run completed" }).click();
  await expect(page.getByText("completed", { exact: true }).first()).toBeVisible();
  await expect(controls.getByRole("button", { name: "Replay from the start" })).toBeVisible();
  await expect(page.getByText("Gap Detector").first()).toBeVisible();

  // Jump back to the first evaluation from the trace and inspect it.
  const trace = page.getByRole("log");
  const evaluation = trace.getByRole("button", { name: /Gap Detector · .*\/10/ }).first();
  await evaluation.click();
  const inspector = page.getByLabel(/Gap Detector · round 1 inspector/);
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText(/Coverage/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();

  await page.getByRole("tab", { name: "routing" }).click();
  await expect(page.getByText("Spend by model")).toBeVisible();
  await expect(page.getByText(/Routing decisions \(\d+\)/)).toBeVisible();
});

test("shows the human decision card on a live run waiting for an answer", async ({ page }) => {
  const base = LOG.slice(0, 220);
  const last = base[base.length - 1];
  const hitl: Event = {
    runId: "fixture-hitl",
    seq: last.seq + 1,
    ts: last.ts + 400,
    type: "hitl.requested",
    agentId: "orchestrator",
    data: {
      requestId: "h1",
      reason: "conflict",
      question: "Two sources disagree on the 12-month outcome. How should the team proceed?",
      context: "Gap Detector score 5.3/10.",
      options: [
        { id: "more", label: "Research the conflict", description: "One more round on the disagreement", action: "research_more", gapIndex: null },
        { id: "continue", label: "Write the brief now", description: "Note the conflict and synthesize", action: "continue", gapIndex: null },
      ],
      recommended: "more",
      timeoutMs: 90_000,
      deadlineTs: Date.now() + 10 * 60_000,
    },
  };
  await serveRun(page, "fixture-hitl", [...base, hitl], false);
  await page.goto("/run/fixture-hitl");

  const card = page.getByRole("dialog", { name: "Human decision needed" });
  await expect(card).toBeVisible();
  await expect(card.getByText(/Two sources disagree/)).toBeVisible();
  await expect(card.getByRole("button", { name: /Research the conflict/ })).toBeEnabled();
  await expect(card.getByRole("button", { name: /Write the brief now/ })).toBeEnabled();
  await expect(card.getByText("recommended", { exact: true })).toBeVisible();
  await expect(card.getByText(/\d\d:\d\d left/)).toBeVisible();
  await expect(page.getByText("awaiting decision")).toBeVisible();
  await expect(page.getByText("☺ Visitor")).toBeVisible();
});
