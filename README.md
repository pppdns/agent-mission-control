# agent-mission-control

Prompt in, a small team of agents out, and a live graph/trace/artifact view of the whole run. See `project-description.md` for the design decisions.

## Setup

1. Apply `supabase/migrations/20261005000000_init.sql` to the Supabase project (SQL editor or `supabase db push`). RLS is enabled with no policies; only the server (secret key) can read or write.
2. Environment variables (`.env.local`):
   `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `TRIGGER_SECRET_KEY`, optional `IP_HASH_SALT`.
3. Run the app and the Trigger.dev worker side by side:

```bash
pnpm dev
npx trigger.dev@latest dev
```

## Layout

- `src/harness/` runtime-agnostic agent harness (event bus, budget, model routing, tool registry, MCP adapter, artifact, roles, runtime). No framework or database imports.
- `src/server/` Supabase store, moderation, rate limits.
- `src/trigger/run-mission.ts` thin Trigger.dev wrapper around the harness.
- `app/api/runs/[id]/events` SSE endpoint used for both live and replayed runs.
- `src/components/` event-sourced UI (`src/harness/view.ts` reducer).

BotID (`botid` package) protects the run-creation server action; it only verifies on Vercel deployments and is a no-op in local dev.

## Local harness run (no database, no Trigger.dev)

```bash
pnpm tsx --env-file=.env.local scripts/run-local.mts "your prompt"
```

## Not in phase 1

loops, human-in-the-loop, context compaction, replay controls, routing UI, the `checkpoints` table.
