/**
 * Runs the harness locally against real models and MCP servers, with an in-memory store and auto-approved HITL.
 *
 *   pnpm tsx --env-file=.env.local scripts/run-local.mts [--low-context] [--resume-from=cp3] "prompt"
 *
 * --low-context      halves the context budgets so compaction is exercised.
 * --resume-from=cpN  after the run, simulates a crash right after checkpoint cpN and resumes from it.
 */
import { writeFileSync } from "node:fs";
import { AutoApprovalGateway } from "../src/harness/approvals";
import { CONTEXT_BUDGETS } from "../src/harness/config";
import { mcpServersFromEnv } from "../src/harness/env";
import { AgentRuntime } from "../src/harness/runtime";
import { MemoryStore } from "../src/harness/store";
import { buildView } from "../src/harness/view";

const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const prompt = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ") || "Should a five-person startup run SQLite in production?";
const resumeFrom = flags.find((f) => f.startsWith("--resume-from="))?.split("=")[1];

if (flags.includes("--low-context")) {
  for (const budget of Object.values(CONTEXT_BUDGETS)) {
    budget.windowTokens = Math.round(budget.windowTokens / 2);
    budget.compactAtTokens = Math.round(budget.compactAtTokens / 2);
  }
}

const deps = (store: MemoryStore) => ({
  runId: "local",
  prompt,
  store,
  keys: { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY },
  mcp: mcpServersFromEnv(process.env),
  approvals: new AutoApprovalGateway(1500),
  onEvent: (line: string) => console.log(line),
});

const store = new MemoryStore();
const summary = await new AgentRuntime(deps(store)).run();
console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
writeFileSync("/tmp/amc-local-events.json", JSON.stringify(store.events, null, 2));
printBrief(store);

if (resumeFrom) {
  const cp = store.checkpoints.find((c) => c.id === resumeFrom);
  if (!cp) throw new Error(`No checkpoint ${resumeFrom}; have ${store.checkpoints.map((c) => c.id).join(", ")}`);
  const crashed = new MemoryStore();
  // Keep a few events past the checkpoint: they belong to work the crash interrupted.
  crashed.events = store.events.filter((e) => e.seq <= cp.seq + 5 && e.type !== "run.completed");
  crashed.checkpoints = store.checkpoints.filter((c) => c.seq <= cp.seq);
  // The run row's totals are synced every few seconds, so at the crash they reflect the truncated log, not the full run.
  crashed.run = { ...store.run, status: "running", totals: buildView(crashed.events).totals };
  console.log(`\n--- simulating a crash after ${cp.id} (${cp.label}); resuming as attempt 2 ---\n`);
  const resumed = await new AgentRuntime(deps(crashed)).resume(2);
  console.log("\nRESUMED SUMMARY", JSON.stringify(resumed, null, 2));
  writeFileSync("/tmp/amc-local-events-resumed.json", JSON.stringify(crashed.events, null, 2));
  printBrief(crashed);
}

function printBrief(s: MemoryStore) {
  const final = s.artifactVersions.at(-1);
  if (!final) return;
  console.log(`\n# ${final.title} (v${final.version})`);
  for (const section of final.sections) {
    console.log(`\n## ${section.title} [${section.status}]`);
    for (const b of section.blocks) console.log(`- ${b.text} ${b.sourceIds.length ? `[${b.sourceIds.join(",")}]` : ""}`);
  }
}
