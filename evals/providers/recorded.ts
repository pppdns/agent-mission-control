/**
 * Promptfoo provider for offline regression evals: instead of calling any model, it loads a recorded event log
 * (the test's `fixture` var, relative to the repo root) and returns the same MissionReport the live mission provider returns. Free and fast,
 * so the trajectory and citation checks can run on every change.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { RunEvent } from "../../src/harness/events";
import { reportFromEvents } from "../lib/mission-report";

/** Fixture paths are relative to the repository root, wherever Promptfoo runs from. */
const REPO_ROOT = new URL("../../", import.meta.url);

export default class RecordedRunProvider {
  id() {
    return "recorded run";
  }

  async callApi(_prompt: string, context?: { vars?: Record<string, unknown> }) {
    const fixture = context?.vars?.fixture;
    if (typeof fixture !== "string") return { error: "Set the `fixture` var to an event log path." };
    const events = JSON.parse(readFileSync(fileURLToPath(new URL(fixture, REPO_ROOT)), "utf8")) as RunEvent[];
    return { output: reportFromEvents(events), cost: 0 };
  }
}
