import { writeFileSync } from "node:fs";
import { AgentRuntime } from "../src/harness/runtime";
import { MemoryStore } from "../src/harness/store";
import { mcpServersFromEnv } from "../src/harness/env";

const prompt = process.argv.slice(2).join(" ") || "Should a five-person startup run SQLite in production?";
const store = new MemoryStore();

const runtime = new AgentRuntime({
  runId: "local",
  prompt,
  store,
  keys: { openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY },
  mcp: mcpServersFromEnv(process.env),
  onEvent: (line) => console.log(line),
});

const summary = await runtime.run();
console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
writeFileSync("/tmp/amc-local-events.json", JSON.stringify(store.events, null, 2));
const final = store.artifactVersions.at(-1);
if (final) {
  console.log(`\n# ${final.title} (v${final.version})`);
  for (const s of final.sections) {
    console.log(`\n## ${s.title} [${s.status}]`);
    for (const b of s.blocks) console.log(`- ${b.text} ${b.sourceIds.length ? `[${b.sourceIds.join(",")}]` : ""}`);
  }
}
