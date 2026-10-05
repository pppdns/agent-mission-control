# Agent Mission Control — Project Summary

> **Project name:** `agent-mission-control` (display name: **Agent Mission Control**)
>
> **Positioning:** a live multi-agent runtime demo. Visitors give a team of AI agents a hard question and watch, in an animated mission-control interface, how an orchestrator assembles the team, and how the agents plan, research, argue, and write. Every message, tool call, token, and dollar is visible along the way.
>
> Decisions and setup status are tracked in [Decisions & Setup Status](#decisions--setup-status).

## Project Goal

Build a visually impressive, public online demo that showcases practical Applied AI Engineering skills through a real, working multi-agent system.

The project is **not intended to be a production SaaS product**. Its purpose is to demonstrate how a modern AI agent harness works internally, while letting any visitor give the system a reasonably general task and watch the agents solve it.

The demo should make the normally invisible parts of agent execution visible:

- planning and orchestration
- reasoning-oriented workflow design
- agent-to-agent communication
- subagents and dynamic teams
- loops and retries
- tool use
- MCP integration
- external API access
- RAG / evidence retrieval
- model routing
- LLM API calls
- context-window budgeting
- compaction
- HITL / approvals
- checkpoints and resumability
- tracing and execution history
- token, latency, and cost accounting
- collaborative artifact creation

The final result should feel like a combination of:

- an autonomous multi-agent system,
- an agent runtime / harness,
- a lightweight observability tool,
- and a visually animated AI "mission control" interface.

The main hiring signal should be:

> "This person understands how to build agent infrastructure, not just how to call an LLM."

---

# Core Product Concept

## Agent Mission Control

The visitor gives the system a broad, complex task such as:

- "Should a startup use Postgres or ClickHouse for this workload?"
- "Investigate why Concorde failed commercially."
- "Is intermittent fasting supported by strong evidence?"
- "Compare React Server Components with a traditional API architecture."
- "Should a five-person startup run SQLite in production?"

The task should be generic enough that most visitors can immediately think of something useful to ask.

The first version deliberately supports three task classes only: **research / investigation**, **comparison**, and **decision support** (see [decision 2](#2-initial-task-scope--decided)).

The system then:

1. analyzes the task,
2. decides what type of work is required,
3. dynamically creates a team of agents,
4. gives agents roles and goals,
5. allows agents to use tools and external sources,
6. lets agents communicate and challenge one another,
7. builds a shared work artifact,
8. detects information gaps or disagreements,
9. loops when more work is required,
10. optionally asks the human for approval or direction,
11. compacts context when necessary,
12. synthesizes the final result.

The agent topology should **not always be a fixed DAG**. Different prompts should produce different teams and workflows.

Example:

```text
                    ┌─ Researcher
                    ├─ Technical Analyst
User → Planner ─────┼─ Skeptic
                    └─ Evidence Verifier
                           ↓
                    Shared Workspace
                           ↓
                         Editor
```

Another task might instead create:

```text
                    ┌─ Advocate
                    ├─ Contrarian
User → Orchestrator ┼─ Data Researcher
                    └─ Fact Checker
                           ↓
                         Judge
                           ↓
                    Final Artifact
```

This dynamic orchestration is one of the main things the demo should showcase.

---

# Shared Work Artifact

The agents should collaborate on a visible, persistent artifact rather than merely producing chat messages.

The artifact can be a general structured document whose default presentation is a research / decision brief.

Possible sections:

- Executive Summary
- Key Findings
- Evidence
- Arguments
- Counterarguments
- Risks
- Open Questions
- Recommendation
- Sources

Agents should be able to:

- create sections,
- edit sections,
- propose revisions,
- comment on claims,
- attach evidence,
- challenge another agent's conclusions,
- request more investigation,
- mark uncertainty,
- resolve disagreements.

The UI should visibly show the artifact changing while the agents work.

Example:

```text
LIVE BRIEF

Executive summary       ✓
Key findings            editing...
Evidence                 8 sources
Counterarguments         reviewing...
Recommendation           blocked

Version 7
```

Artifact revisions should ideally be versioned.

---

# UI / Visual Spectacle

The system should make agent execution visually understandable and interesting, and a futuristic visual spectacle itself, with animations and rich, polished UI.

## Main Layout

A possible desktop layout:

```text
┌─────────────────────────────────────────────────────────────┐
│ Run: "Should SQLite be used for this SaaS?"                │
│ $0.083 · 38.2k tokens · 41s · 7 agents                     │
├──────────────────────────┬──────────────────────────────────┤
│                          │                                  │
│      AGENT GRAPH         │          LIVE ARTIFACT           │
│                          │                                  │
│    ○────○────○           │ Executive Summary                │
│     \  /                 │ Findings                         │
│      ○────○              │ Evidence                         │
│          │               │ Risks                            │
│          ○               │ Recommendation                   │
│                          │                                  │
├──────────────────────────┴──────────────────────────────────┤
│ EVENT TRACE                                                │
│ Researcher → web_search (Tavily MCP)                       │
│ Skeptic challenges claim #12                               │
│ Planner spawned EvidenceVerifier                           │
│ Context compacted: 29.1k → 11.4k                           │
└─────────────────────────────────────────────────────────────┘
```

## Visualized Events

The graph should animate when:

- an agent is spawned,
- an agent starts or finishes,
- a message travels between agents,
- an agent requests a tool,
- a tool returns,
- an agent delegates work,
- a retry happens,
- a disagreement is raised,
- a new research branch is created,
- HITL approval is requested,
- compaction occurs,
- an artifact section changes,
- a model is routed,
- the run completes.

Edges between nodes can animate when information moves between agents.

Clicking an agent should reveal things such as:

- role
- current goal
- model
- status
- token usage
- cost
- current context
- tool permissions
- messages
- outputs

Clicking an edge should reveal the agent-to-agent message.

Clicking an LLM call should show:

- provider
- model
- input tokens
- output tokens
- latency
- cost
- structured output
- routing reason

Clicking a tool call should show:

- tool
- parameters
- result
- duration
- success / failure
- retry information

---

# Context Window Visualization

Context management should be a first-class visual feature.

Example:

```text
GPT / Claude Agent Context

████████████████░░░░  73%

System          4.2k
Working state   3.1k
Recent turns   21.8k
Tool results   34.7k
Retrieved      12.2k
────────────────────
Total          76.0k

Reserved output 16k
```

The harness should manage context itself.

The demo can intentionally use a smaller configurable working-context budget so that compaction happens during realistic visitor sessions instead of requiring an enormous context window.

Example:

```text
CONTEXT COMPACTION

29,100 tokens
      ↓
11,400 tokens

17,700 tokens reclaimed
```

The user should be able to inspect:

- what was removed,
- what was summarized,
- what was preserved,
- the compacted state,
- why compaction was triggered.

This is an important Applied AI Engineering demonstration.

---

# Agent Harness

The interesting orchestration logic should live in custom TypeScript code rather than being hidden entirely inside a high-level framework.

Possible core abstractions:

```text
AgentRuntime
RunContext
Agent
Subagent
Orchestrator
ModelRouter
ContextManager
Compactor
ToolRegistry
McpToolAdapter
EvidenceStore
ArtifactManager
ApprovalManager
CheckpointManager
EventBus
Evaluator
```

A framework or SDK can still be used for low-level plumbing, model provider adapters, streaming, MCP connectivity, etc.

The project should visibly demonstrate ownership of the agent loop itself.

---

# Event-Driven Runtime

Most important state changes should emit structured events.

Example events:

```text
run.created
run.started

agent.spawned
agent.started
agent.message_sent
agent.delegated
agent.retrying
agent.completed
agent.failed

llm.requested
llm.streaming
llm.completed

tool.requested
tool.completed
tool.failed

context.updated
context.threshold_reached
context.compacting
context.compacted

artifact.created
artifact.section_added
artifact.updated
artifact.version_created

hitl.requested
hitl.resolved

checkpoint.created
run.completed
run.failed
```

The frontend should primarily visualize this event stream.

This also makes replaying historical runs straightforward.

---

# Run Replay

A finished run should remain replayable.

For example:

```text
/run/abc123
```

A visitor can replay the execution from the event log.

Possible timeline:

```text
00:00 Planner starts
00:04 Spawn 3 agents
00:08 Web search (Tavily)
00:11 Researcher publishes finding
00:14 Skeptic challenges claim
00:18 New EvidenceVerifier spawned
00:26 Context reaches threshold
00:27 Context compaction
00:32 Editor begins synthesis
00:41 HITL approval requested
00:48 Run resumes
00:56 Final artifact completed
```

The replay can support:

- play
- pause
- speed controls
- timeline scrubbing
- jump to event
- inspect historical agent state

This produces a very strong portfolio/demo effect.

---

# Human-in-the-Loop

HITL should happen for meaningful reasons rather than as an arbitrary approval dialog.

Example:

```text
The agents found conflicting evidence.

Choose:

A. Spend more research budget and investigate 5 additional sources
B. Continue with current evidence
C. Investigate a specific angle
```

The run visibly pauses.

After the visitor makes a choice, execution resumes from the checkpoint.

Other HITL examples:

- approve a costly tool operation,
- choose between two investigation directions,
- resolve ambiguous intent,
- choose a recommendation criterion,
- approve additional research budget.

---

# Agent-to-Agent Communication

Agent communication should be explicit and visualizable.

Possible message types:

```text
finding
claim
evidence
objection
question
request
delegation
review
revision
decision
```

Example:

```text
Researcher
  ↓ finding
Skeptic
  ↓ objection
EvidenceVerifier
  ↓ verified evidence
Editor
```

Agent messages should become graph animations and trace events.

---

# Agent Loops

The demo should contain real loops rather than only a single pass through a graph.

Example:

```text
Research
   ↓
Synthesis
   ↓
Gap Detector
   ↓
Enough evidence?
   ├─ yes → final synthesis
   └─ no  → new research task
                    ↓
                  loop
```

Other loop triggers:

- unsupported claim,
- disagreement between agents,
- tool failure,
- incomplete artifact,
- evaluator score below threshold,
- missing source,
- failed validation.

---

# Model Routing

Multiple providers should be supported.

Initial target providers:

- OpenAI
- Anthropic

Optional later providers:

- Google Gemini
- Groq
- other OpenAI-compatible providers

The model router can decide based on:

- reasoning difficulty
- latency requirement
- cost
- context size
- task type
- structured-output reliability
- tool-use quality

Example:

```text
Planner           → strong reasoning model
Parallel research → cheap / fast model
Extraction        → inexpensive model
Skeptic           → stronger reasoning model
Final synthesis   → high-quality model
```

The UI should show model badges directly on each agent.

It should also explain the routing decision:

```text
route: simple_parallel_research
→ gpt-6-luna
```

The concrete v1 routing policy is in [decision 12](#12-model-routing-policy--partially-decided).

Possible visitor-selectable strategies (later; v1 ships with `Auto` only):

```text
Auto
Cheap
Fast
Best
```

---

# External Data Strategy

The demo should avoid brute-force web scraping.

The preferred approach is:

1. use structured public APIs,
2. use targeted web search,
3. scrape only a very small number of pages when needed.

## v1 tools

The first version uses exactly two external tools, both connected through MCP:

- **Web search: Tavily MCP.** This is the primary research tool.
- **Single-page fetch: Firecrawl MCP.** Used rarely, and only for URLs returned by the run's own searches.

The sources below are candidates for later phases.

## Later sources

## Wikipedia / MediaWiki

Good for broad general knowledge.

Possible uses:

- search
- page retrieval
- references
- history
- related concepts

## Wikidata

Useful for structured entities and relationships.

Especially valuable if the UI eventually includes a knowledge / evidence graph.

## OpenAlex

Useful for scholarly research.

Possible uses:

- papers
- authors
- institutions
- citations
- topics

## Crossref

Useful for scholarly metadata.

## Hacker News API

Useful for technology and startup discussions.

## Stack Exchange API

Useful for technical/practical questions.

## GitHub API / GitHub MCP

Useful for:

- public repositories
- issues
- pull requests
- commits
- releases
- code-related tasks

## Firecrawl

In v1, Firecrawl is used only for fetching single pages (web search goes through Tavily):

- fetching a small number of relevant pages found by search,
- extracting page content.

Do not make large-scale scraping a default part of the run.

---

# Research Budget

Every run should have a visible external-resource budget.

Example:

```text
RESEARCH BUDGET

Web Search (Tavily)     5 / 8
Page Fetch (Firecrawl)  1 / 2
LLM calls              17 / 30
Cost                $0.21 / $0.50
```

The orchestrator should be aware of the remaining budget.

This provides:

- predictable public-demo cost,
- another interesting planning constraint,
- an additional visual element,
- an opportunity for HITL when the budget is exhausted.

---

# RAG / Evidence Store

No large persistent knowledge base is required.

Instead, each run can have an ephemeral evidence store.

Example:

```text
External sources
      ↓
Retrieve / scrape
      ↓
Normalize
      ↓
Chunk
      ↓
Run-local evidence store
      ↓
Search / rank
      ↓
Agent context
```

The system can demonstrate:

- retrieval,
- ranking,
- citation,
- evidence reuse,
- context budgeting,

without requiring a large ingestion pipeline.

Potential retrieval techniques:

- keyword / BM25
- embeddings
- hybrid search
- reranking

Supabase pgvector can be added later if useful, but is not required for the initial version.

---

# Supabase

Supabase is useful for this demo because persistent execution state materially improves the experience.

Keep the schema intentionally small.

Possible tables:

```text
runs
agents
events
messages
artifacts
artifact_versions
sources
checkpoints
```

Potential uses:

- preserving runs across refreshes,
- storing execution history,
- resuming paused runs,
- persisting HITL checkpoints,
- artifact versioning,
- sharing runs via URL,
- replaying completed runs,
- storing sources.

Access is **server-only**: Server Actions, Server Components, route handlers, and Trigger.dev tasks talk to Supabase with the secret key. The browser never gets a Supabase client, and we don't rely on RLS policies for access control. RLS stays enabled with no policies, so the public key can't read anything (defense in depth).

Supabase should support the harness rather than becoming the focus of the project.

---

# Suggested Technology Stack

## Application

- Next.js 16 (App Router, Server Actions)
- TypeScript
- React 19
- Tailwind CSS 4
- pnpm

## Agent / LLM layer

Possible base:

- Vercel AI SDK for model/provider abstraction and streaming

Custom TypeScript:

- orchestration
- agent runtime
- context management
- compaction
- model routing
- event system
- artifact collaboration
- HITL
- checkpoints
- evaluation

## State

- Supabase Postgres (server-only access)

## Execution

- Trigger.dev for running agent missions (long runs, HITL pauses, retries, concurrency limits)

## External tools

v1:

- Tavily MCP (web search)
- Firecrawl MCP (single-page fetch)

Later:

- Wikipedia / MediaWiki
- Wikidata
- OpenAlex
- Crossref
- Hacker News API
- Stack Exchange
- GitHub

## Visualization

Possible libraries:

- React Flow for agent graph
- Framer Motion / Motion for animations
- custom event timeline
- charts for cost/token/context usage

---

# MVP Scope

A good first version does not need every feature.

## Phase 1

Status: shipped.

Build:

- prompt input
- one orchestrator
- dynamic creation of 2–4 agents
- OpenAI + Anthropic model adapters
- basic tool registry with an MCP tool adapter
- Tavily web search (MCP) + Firecrawl page fetch (MCP)
- agent-to-agent messages
- shared artifact
- streaming event trace
- animated graph
- token / cost / latency display
- persisted run state

## Phase 2

Status: shipped. HITL is kept simple for the demo: anyone viewing a live run can answer, the first answer wins, and the recommended option is applied when nobody answers in time.

Add:

- compaction
- context visualization
- agent loops
- evaluator / gap detector
- HITL
- checkpoint/resume
- run replay
- model routing
- research budgets

## Phase 3

Add:

- additional sources: Wikipedia / OpenAlex / Wikidata / GitHub
- run-local RAG
- artifact revision graph
- richer orchestration
- agent swarm / tournament mode
- comparison of multiple orchestration strategies

---

# What This Project Should Demonstrate to Employers

The demo should provide evidence that you understand:

## LLM engineering

- model APIs
- streaming
- structured output
- token accounting
- context limits
- prompt design
- provider differences

## Agent engineering

- agent loops
- tool invocation
- delegation
- planning
- subagents
- orchestration
- retries
- evaluator patterns
- agent communication

## Context engineering

- context composition
- token budgeting
- compaction
- summarization
- retrieval
- externalized state

## Applied AI architecture

- model routing
- RAG
- MCP
- tool abstraction
- HITL
- checkpoints
- observability
- cost controls
- failure handling

## Software engineering

- TypeScript
- Next.js
- event-driven architecture
- persistent state
- realtime UI
- resilient APIs
- modular architecture

## Product thinking

- explainability
- UX around autonomous systems
- trust
- human control
- cost visibility
- transparent execution

---

# Design Principle

The project should optimize for:

> **maximum visible agent behavior per unit of infrastructure.**

Avoid spending time building:

- large proprietary datasets,
- account systems,
- complex billing,
- ingestion pipelines,
- custom search engines,
- huge scraping infrastructure,
- domain-specific business logic.

Use existing APIs and tools wherever possible.

Spend engineering effort on:

- the harness,
- orchestration,
- agent behavior,
- context management,
- visualization,
- observability,
- artifact collaboration,
- model/tool routing.

---

# Decisions & Setup Status

This section records product decisions and external setup. Status labels:

- **Decided**: agreed; build against it.
- **Done**: external setup is complete.
- **Proposed**: a recommendation that still needs a final OK (or a change).
- **Deferred**: intentionally out of scope for v1.

| #   | Topic                           | Status                                  |
| --- | ------------------------------- | --------------------------------------- |
| 1   | Name and positioning            | Decided                                 |
| 2   | Initial task scope              | Decided                                 |
| 3   | First agent roles               | Decided                                 |
| 4   | Artifact format                 | Decided                                 |
| 5   | Exposed agent reasoning         | Decided                                 |
| 6   | LLM provider keys               | Done                                    |
| 7   | Supabase                        | Done                                    |
| 8   | Firecrawl                       | Done                                    |
| 9   | Other external APIs             | Deferred                                |
| 10  | MCP integrations                | Decided                                 |
| 11  | Public-demo cost limits         | Decided (tune after real runs)          |
| 12  | Model routing                   | Decided                                 |
| 13  | Context budgets                 | Decided                                 |
| 14  | Public-run persistence          | Decided                                 |
| 15  | Abuse / cost protection         | Decided                                 |
| 16  | Demo example prompts            | Decided                                 |
| 17  | Landing page and showcase runs  | Decided                                 |
| 18  | Deployment infrastructure       | Decided                                 |

## Environment and Project References

| Service     | Details                                                                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel      | Project auto-deploys from git. Dev and prod env vars are stored in Vercel; pull them locally with `vercel env pull .env.local`.                 |
| Supabase    | Project ID `ciyibyohofcpdsjfwkka` (`https://ciyibyohofcpdsjfwkka.supabase.co`). One instance for dev and prod. Supabase MCP connected.          |
| Trigger.dev | Project ID `proj_wyrlfblciupfknnpcjcf`. Config in `trigger.config.ts`, tasks in `src/trigger/`.                                                 |
| OpenAI      | `OPENAI_API_KEY`                                                                                                                                |
| Anthropic   | `ANTHROPIC_API_KEY`                                                                                                                             |
| Tavily      | `TAVILY_API_KEY` (web search via Tavily MCP)                                                                                                    |
| Firecrawl   | `FIRECRAWL_API_KEY` (single-page fetch via Firecrawl MCP)                                                                                       |

Env vars in Vercel (dev and prod):

- LLM providers: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`
- Tools: `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`
- Supabase: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`. Only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are used, server-side; the publishable key is unused because the browser never talks to Supabase.
- Trigger.dev: `TRIGGER_SECRET_KEY`, with the dev key in Development and the prod key in Production.

---

## 1. Public positioning / name — Decided

- Project / repo name: `agent-mission-control`. Display name: **Agent Mission Control**.
- Framing: a **live multi-agent runtime demo**. The animated mission-control UI is the visual showcase; the custom agent runtime underneath is the substance.
- Positioning statement:

  > Agent Mission Control is a live, inspectable multi-agent runtime. Give it a hard question and watch an orchestrator assemble a team of AI agents that plan, research, argue, and write, with every message, tool call, token, and dollar visible.

- Tagline (proposed default): **"Watch AI agents work as a team."**
  Alternatives: "A multi-agent runtime you can watch." / "Mission control for AI agents." / "See inside a multi-agent system, live."
- Don't frame it as a research-assistant product. Research is the *task type*; the runtime is the *product*.

---

## 2. Initial task scope — Decided

Prompt box placeholder:

> "Give the agents a question to research, options to compare, or a decision to analyze."

Supported v1 task classes. The orchestrator classifies every prompt into exactly one of them:

| Class                  | Example prompts                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Research / investigation | "Why did Concorde fail commercially?", "Is intermittent fasting supported by strong evidence?" |
| Comparison             | "Postgres vs ClickHouse for product analytics", "React Server Components vs a traditional API"  |
| Decision support       | "Should a five-person startup run SQLite in production?"                                        |

All three produce the same artifact type (the brief), which keeps prompts, roles, and evaluation consistent.

Out of scope for v1:

- open-ended planning (launch strategies, roadmaps),
- creative or long-form writing,
- code generation,
- tasks that need private data or real-world actions,
- personal medical, legal, or financial advice.

Out-of-scope prompts are handled in one of two ways. When reasonable, the orchestrator reframes the prompt into the nearest supported class and shows the reframe as a visible event (for example, "launch strategy for X" becomes "which launch approaches worked for comparable developer tools?"). Otherwise it declines without spawning any agents.

---

## 3. First agent roles — Decided

Role catalog:

- Orchestrator / Planner
- Researcher
- Skeptic
- Evidence Verifier
- Editor / Synthesizer

How v1 stays dynamic: the orchestrator decides which roles a run needs, how many instances of each to spawn (for example, three parallel Researchers, each with a distinct angle), and each agent's specific goal. So the topology differs from prompt to prompt even with a fixed catalog. Fully generated roles come later.

---

## 4. Artifact format — Decided

Use a **generic structured document**, presented by default as a research / decision brief, with the sections listed in [Shared Work Artifact](#shared-work-artifact).

Model the sections as typed blocks whose claims link to evidence (source IDs). That way a claim/evidence graph view can be added later without changing the data model. Every edit creates a new artifact version.

---

## 5. Exposed agent reasoning — Decided

Don't expose raw chain-of-thought. Each agent step produces explicit structured outputs, and these are what the agent inspector and the event trace show:

- plan
- current objective
- rationale
- decisions
- observations
- critiques
- evidence
- next action

---

## 6. Provider accounts / API keys — Done

- OpenAI and Anthropic API keys are stored in Vercel (dev and prod) and in `.env.local`.
- Remaining: set hard monthly spending limits in both provider dashboards before the demo goes public.
- Later: Google Gemini or other providers.

---

## 7. Supabase — Done

- Project ID `ciyibyohofcpdsjfwkka`. **The same instance serves dev and prod.** This is a demo app, so there's no environment separation. Store an `env` column on `runs` so local dev runs never show up in featured lists.
- Supabase MCP is connected. The schema lives in `supabase/migrations/` and is applied with `pnpm supabase db push`.
- **Access pattern: server-only.** Server Actions handle mutations, Server Components and route handlers handle reads, and Trigger.dev tasks write runtime state, all using the secret key. The browser never creates a Supabase client, and access control does not rely on RLS policies. Enable RLS on every table with no policies, so the public key can read nothing (defense in depth).
- Retention: runs never expire (see decision 14).
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are stored in Vercel (dev and prod) and are available to Trigger.dev tasks.

---

## 8. Firecrawl — Done

- `FIRECRAWL_API_KEY` is stored in Vercel and `.env.local`.
- Role: **single-page fetch only, used rarely.** Web search goes through Tavily.
- Per-run limit: 2 page fetches, shown in the research budget.
- Only allow fetching URLs that appeared in the same run's search results. Visitors can't make the system fetch arbitrary URLs, which avoids abuse, server-side request forgery (SSRF), and surprise costs.

---

## 9. Other external APIs — Deferred

Not part of v1. Later candidates: Wikipedia / MediaWiki, Wikidata, OpenAlex, Crossref, Hacker News, Stack Exchange, GitHub. Most of these don't need credentials.

---

## 10. MCP integrations — Decided

v1 uses two tools, both connected through MCP:

- **Web search: Tavily MCP** (authenticated with `TAVILY_API_KEY`). The primary research tool.
- **Single-page fetch: Firecrawl MCP** (authenticated with `FIRECRAWL_API_KEY`). Used rarely (see decision 8).

Implementation notes:

- Both servers are registered into the `ToolRegistry` through the `McpToolAdapter`. For every call, the UI shows the MCP server, tool name, input schema, parameters, latency, and result.
- Expose only an allow-listed subset of each server's tools (for example, Tavily search only; Firecrawl scrape only, without crawl, map, or agent). This keeps cost predictable and context small, since every tool schema costs tokens.
- Tool permissions per role, shown in the agent inspector:

| Role                     | Tools                      |
| ------------------------ | -------------------------- |
| Researcher               | web search, page fetch     |
| Evidence Verifier        | web search, page fetch     |
| Skeptic                  | web search                 |
| Orchestrator / Editor    | none (they work from the run's evidence store) |

---

## 11. Public-demo cost limits — Decided (tune after real runs)

Initial per-run limits:

```text
max input length:        2,000 characters
max agents per run:      8 (orchestrator, up to 4 workers, gap detector, editor, plus one loop spawn)
max LLM calls:           30  (4 held back for the gap detector and the editor)
max research loops:      2   (follow-up rounds after the first)
max web searches:        8   (Tavily; 2 held back for follow-up rounds)
max page fetches:        2   (Firecrawl)
max active run time:     5 min (time spent waiting on HITL doesn't count)
per-run cost cap:        $0.50
max HITL requests:       2, each answered within 5 min or the recommended option is used
one-time extension:      +3 searches, +1 fetch, +8 LLM calls, +$0.20, +90 s, only with visitor approval
```

When a limit is reached, the run doesn't fail. The orchestrator is told that the budget is exhausted and moves straight to synthesis with the evidence it already has. That moment is itself a visible event ("budget exhausted → synthesizing"), which makes for good demo material.

Tune all numbers after measuring real runs, especially the cost cap once real `gpt-6.1-sol` usage is known.

---

## 12. Model-routing policy — Decided

- **Simple tasks → GPT-6 Luna** (`gpt-6-luna`).
- **Very complex tasks → GPT-6.1 Sol** (`gpt-6.1-sol`).
- **Critique roles → Claude Sonnet 5.5** (`claude-sonnet-5-5`). The Skeptic and Evidence Verifier run on a different model family from the agents whose work they review. A critic from a different model family is less likely to share the same blind spots, and it also shows off multi-provider routing.

All three model IDs are confirmed to be available on the project's API keys.

| Work                                   | Route              | Model                          |
| -------------------------------------- | ------------------ | ------------------------------ |
| Orchestration / planning               | complex            | `gpt-6.1-sol`                  |
| Research tool loops                    | simple             | `gpt-6-luna`                   |
| Extraction / evidence normalization    | simple             | `gpt-6-luna`                   |
| Compaction summaries                   | simple             | `gpt-6-luna`                   |
| Skeptic / evidence verification        | critique           | `claude-sonnet-5-5`            |
| Gap detection / evaluation             | complex            | `gpt-6.1-sol`                  |
| Final synthesis                        | complex            | `gpt-6.1-sol`                  |

Rules:

- All routing rules live in one explicit config. Every routing decision emits an event with the route name and the reason, and the UI shows it as the model badge on the agent.
- Rules are named and chosen per LLM call by its kind (`complex_planning`, `simple_parallel_research`, `critique_cross_family`, `complex_gap_detection`, `complex_synthesis`, `simple_compaction`). Prompts estimated above 20k tokens on the cheap route escalate (`escalate_large_context`); provider errors use `fallback_provider_error`.
- If a provider errors or times out, fall back to the other provider. The fallback is shown as a visible retry event.
- v1 ships with the `Auto` strategy only. `Cheap` / `Fast` / `Best` come later.

---

## 13. Context budgets — Decided

Use demo context thresholds that cause compaction to happen visibly.

Do not necessarily use the provider's maximum context.

Shipped values (`CONTEXT_BUDGETS` in `src/harness/config.ts`):

```text
                 window   compaction threshold   reserved output
worker loops       12k             7k                  3k
synthesis calls    24k            12k                  9k
```

Tool loops prune handed-in material (brief excerpts, source digests) first, and summarize older tool turns with `gpt-6-luna` only when that is not enough; the latest call and its results are always kept together. Single-shot calls (gap detector, editor) only prune. Token counts are estimated at 4 characters per token and calibrated per agent against provider-reported input tokens.

Tune based on actual model behavior.

---

## 14. Public-run persistence — Decided

- **Every run gets a public URL**, `/run/[id]`, with an unguessable ID.
- **Runs never expire.**
- **Visitors can't delete runs.**
- **Run URLs are unlisted.** Run pages send `noindex, nofollow` (both as a meta tag and as an `X-Robots-Tag` header) and are left out of the sitemap. Don't also block `/run/` in `robots.txt`: if crawlers can't fetch the page, they never see the `noindex`, and the bare URL can still get indexed from external links.
- **Prompts aren't publicly discoverable.** There is no public list of all runs; the landing page shows only curated featured runs (see decision 17).

Safeguards, because runs are public and permanent:

- **Public-run notice** directly under the prompt box: "Runs are public and permanent — don't include personal information."
- **Admin-only `hidden` flag for takedowns.** Visitors can't delete runs, but we still need a way to remove abusive content. Keep it minimal: a `hidden boolean not null default false` column on `runs`, flipped manually in the Supabase dashboard or through the Supabase MCP, with no admin UI. When a run is hidden, its page returns 404, its event stream refuses to serve events, and it can't be featured. The data stays in the database.
- **Prompt moderation.** The prompt goes through the OpenAI moderation endpoint (`omni-moderation-latest`, free) inside the run-creation Server Action, before any run is created or persisted. Flagged prompts get a short rejection message and cost nothing beyond the moderation call.

---

## 15. Abuse / cost protection — Decided

- **Vercel BotID** on the run-creation Server Action.
- **IP-based rate limiting.** A salted hash of the IP stored in Supabase, with limits of **3 live runs per hour, 10 per day, and 1 concurrent active run per IP**.

Additional protections:

- **Global concurrency cap.** For example, at most 5 live runs at once, enforced with a Trigger.dev queue concurrency limit. Extra runs wait in a visible "queued" state.
- **Global daily spend circuit breaker.** Per-run cost is already computed for the telemetry, so sum it per day (for example, a $25/day cap). Once the cap is hit, the prompt box is replaced with "Today's live-demo budget is used up — watch a replay" and the featured runs. Replays cost nothing.
- **Provider-side hard spending limits** (OpenAI and Anthropic dashboards), plus checking the Tavily and Firecrawl plan limits, as the last line of defense.
- **Input limits:** 2,000 characters, plus the moderation check from decision 14.
- **Tool restrictions:** allow-listed MCP tools only, and page fetches only for URLs found by search (decisions 8 and 10).
- **Per-run caps** from decision 11.
- **HITL timeout.** If the visitor doesn't answer within 5 minutes, the run continues with the recommended option, marked as "auto-resolved". Abandoned runs don't hang forever, and recorded runs always reach a final artifact.

---

## 16. Demo example prompts — Decided

Prepare several prebuilt prompts that reliably show different harness behaviors.

Examples should intentionally demonstrate:

- parallel agents,
- disagreement,
- tool usage,
- looping,
- model routing,
- compaction,
- HITL.

These appear as clickable example chips under the prompt box on the landing page. After measuring real runs, keep only the prompts that reliably trigger the behavior they're meant to show.

---

## 17. Landing page and showcase runs — Decided

The landing page has two parts:

1. **A prompt box**, with the example prompt chips from decision 16.
2. **A list of featured runs** that visitors can replay.

Details:

- Featured runs are curated. Runs have a `featured` flag (plus a sort order) that is set manually in Supabase. There is no feed of recent visitor runs; visitor runs stay unlisted.
- At least one especially polished showcase run is the primary call to action ("Watch an example run"). It's deterministic by construction: a replay plays back the recorded event log and makes no LLM calls.
- The replay player supports play / pause, speed controls (1×, 2×, 4×), timeline scrubbing, and jump-to-event.
- Live runs and replays use the same player. A live run is simply the player following the end of the event log as it grows.

---

## 18. Deployment infrastructure — Decided

Already configured: Vercel (auto-deploys, env vars), Supabase, Trigger.dev.

Architecture:

```text
Browser
  │  Server Action: createRun  (BotID, rate limit, moderation)
  ▼
Next.js on Vercel ──trigger──▶ Trigger.dev task: run-mission
  ▲                                   │  AgentRuntime (plain TypeScript)
  │  SSE: /api/runs/[id]/events       │  appends events, artifact versions,
  │  (reads events after cursor)      │  checkpoints
  │                                   ▼
  └────────────────────────────── Supabase Postgres
```

**Run execution on Trigger.dev, from the start.** Runs take minutes, HITL pauses can last indefinitely, and LLM and tool calls need retries. Running them in Vercel functions would mean working around function duration limits. Trigger.dev provides:

- no execution timeouts,
- wait tokens for HITL (a paused run is checkpointed and isn't billed while it waits),
- retries,
- queue concurrency limits (the global cap from decision 15).

This also directly backs the "checkpoints and resumability" part of the showcase. Deciding it now avoids a rewrite after the MVP.

**Keep the harness runtime-agnostic.** `AgentRuntime` is plain TypeScript with no Trigger.dev imports, and the Trigger.dev task is a thin wrapper around it. The harness can then also run in a local script or in tests, and could move to another executor (for example, Vercel Workflow) without changes.

**Event delivery:**

- The runtime appends events to a Supabase `events` table, each with a per-run sequence number (`seq`).
- The browser receives events through a Server-Sent Events (SSE) route handler on Vercel. The handler reads events with `seq` greater than the client's cursor, server-side. On reconnect (after a network drop or when the function's max duration is reached), the client resumes from its last `seq` using `Last-Event-ID`.
- This keeps Supabase server-only and makes live viewing and replay a single code path.
- Don't persist every streamed token. Persist events at step granularity, and coalesce streaming text into periodic deltas (for example, every ~250 ms).
- Considered alternative: Trigger.dev Realtime streams. Not chosen as the main channel, because replay needs the persistent event log in Supabase anyway.

**Other suggested tools:**

- Vercel AI SDK for provider adapters, streaming, structured output, and the MCP client.
- Zod schemas for every structured agent output.
- React Flow (`@xyflow/react`) for the agent graph, Motion for animations.
- Sentry for error monitoring (optional; the Sentry MCP is already configured).

The provider, tool, and Supabase env vars are already available to Trigger.dev tasks.

Remaining setup:

- Deploy Trigger.dev tasks alongside the app, through the Vercel integration or a `trigger deploy` CI step.

---

## Remaining Manual To-Dos

- [x] Add `SUPABASE_URL` and `SUPABASE_SECRET_KEY` to Vercel (dev and prod).
- [x] Add `TRIGGER_SECRET_KEY` to Vercel (dev and prod values), replacing `TRIGGER_DEV_API_KEY`.
- [x] Make env vars available to Trigger.dev tasks (decision 18).
- [ ] Set hard spending limits in the OpenAI and Anthropic dashboards, and check the Tavily and Firecrawl plan limits.
- [x] Enable BotID for the Vercel project (the `botid` package; no dashboard step needed).
- [ ] After the first real runs: tune the limits and context budgets, pick featured runs, and record the showcase run.

---

# Initial Success Criterion

The first version is successful if a recruiter can open the site, type a normal complex question, and within a minute clearly observe:

1. an orchestrator understand the task,
2. multiple agents appear,
3. agents work in parallel,
4. tools are called,
5. agents exchange findings,
6. one agent challenges another,
7. the shared artifact changes,
8. a loop or retry occurs,
9. model/token/cost telemetry is visible,
10. the system produces a useful final artifact.

If the visitor finishes the run thinking:

> "I understand what this agent system was doing internally, and this is clearly more than a chatbot wrapper,"

the demo has achieved its purpose.