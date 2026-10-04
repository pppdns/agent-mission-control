# Agent Mission Control — Project Summary

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
- "Create a launch strategy for a new developer tool."
- "Is intermittent fasting supported by strong evidence?"
- "Compare React Server Components with a traditional API architecture."
- "Analyze the arguments for and against adopting this technology."

The task should be generic enough that most visitors can immediately think of something useful to ask.

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
│ Researcher → Wikipedia                                     │
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
/demo/run/abc123
```

A visitor can replay the execution from the event log.

Possible timeline:

```text
00:00 Planner starts
00:04 Spawn 3 agents
00:08 Wikipedia lookup
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
route: cheap_parallel_research
→ GPT-5.x fast model
```

Possible visitor-selectable strategies:

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

Target external sources:

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

Use as a fallback for:

- targeted web search,
- scraping a small number of relevant pages,
- extracting page content.

Do not make large-scale scraping a default part of the run.

---

# Research Budget

Every run should have a visible external-resource budget.

Example:

```text
RESEARCH BUDGET

Wikipedia       4 calls
Wikidata        2 calls
OpenAlex        1 call
Web Search      2 calls
Page Scrape     1 / 3
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
- storing sources,
- optionally using Supabase Realtime.

Supabase should support the harness rather than becoming the focus of the project.

---

# Suggested Technology Stack

## Application

- Next.js
- TypeScript
- React
- Tailwind CSS

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

- Supabase Postgres
- optionally Supabase Realtime

## External tools

- MCP clients / servers
- Firecrawl
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

Build:

- prompt input
- one orchestrator
- dynamic creation of 2–4 agents
- OpenAI + Anthropic model adapters
- basic tool registry
- Wikipedia + web-search tool
- agent-to-agent messages
- shared artifact
- streaming event trace
- animated graph
- token / cost / latency display
- persisted run state

## Phase 2

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

- MCP integration
- OpenAlex / Wikidata / GitHub
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

# Manual Work / Decisions Still Required

These are tasks that should **not simply be delegated blindly to the coding agent** because they require credentials, product decisions, external setup, or personal judgment.

## 1. Decide the public positioning / name

Current working concept:

**Agent Mission Control**

Decide:

- final project name,
- tagline,
- whether it is framed as a research agent, general problem-solving system, or agent-runtime demo.

Recommendation: keep it generic and frame it as an **AI Agent Mission Control / multi-agent workbench**.

---

## 2. Decide the initial task scope

Choose what the public prompt should encourage.

Possible default wording:

> "Give the agents a complex question, decision, investigation, or planning task."

Decide which task classes are explicitly supported in the MVP:

- research
- comparison
- decision support
- analysis
- planning
- artifact creation

Avoid making the initial scope too broad if it hurts reliability.

---

## 3. Decide the first agent roles

Choose a small default set.

Suggested starting roles:

- Orchestrator / Planner
- Researcher
- Skeptic
- Evidence Verifier
- Editor / Synthesizer

Later, allow the planner to generate roles dynamically.

---

## 4. Decide artifact format

Open question:

Should the primary artifact be:

- a living research brief,
- a generic structured document,
- a claim/evidence graph,
- or a combination?

Current recommendation:

Use a **generic structured document**, presented by default as a research / decision brief.

---

## 5. Decide how much agent reasoning is exposed

Do not rely on exposing raw private chain-of-thought.

Instead decide what visible reasoning artifacts the agents produce, such as:

- plan
- current objective
- rationale
- decisions
- observations
- critiques
- evidence
- next action

Design these as explicit structured outputs.

---

## 6. Create provider accounts / API keys

Obtain and configure:

- OpenAI API key
- Anthropic API key

Optional later:

- Google Gemini API key
- additional model providers

Set spending limits before making the demo public.

---

## 7. Create Supabase project

If persistent runs are included:

- create Supabase project,
- copy project URL,
- configure service / anon keys,
- configure environment variables,
- decide retention policy for public runs.

---

## 8. Configure Firecrawl

If used:

- create Firecrawl account,
- obtain API key,
- decide per-run scraping limit,
- implement server-side usage controls.

---

## 9. Configure optional external APIs

Evaluate and obtain credentials where required for:

- OpenAlex
- GitHub
- other public APIs

Many public APIs can be used without credentials, but server-side authenticated access may provide better rate limits.

---

## 10. Decide MCP integrations

Pick 1–2 MCP integrations for the first public version.

Good candidates:

- GitHub MCP
- web/search MCP
- Firecrawl MCP

Avoid adding many MCP servers simply for quantity.

The goal is to demonstrate the abstraction clearly.

---

## 11. Define public-demo cost limits

Decide:

- maximum agents per run,
- maximum LLM calls,
- maximum tool calls,
- maximum web searches,
- maximum scraped pages,
- maximum run duration,
- token budget,
- monetary budget.

Example initial constraints:

```text
max agents:        6
max LLM calls:    30
max external calls: 15
max page scrapes:  3
```

Tune these after measuring real runs.

---

## 12. Define model-routing policy

Choose which models initially handle:

- orchestration,
- research,
- extraction,
- critique,
- synthesis,
- compaction.

Start simple and make routing rules explicit.

---

## 13. Decide context budgets

Choose demo context thresholds that cause compaction to happen visibly.

Do not necessarily use the provider's maximum context.

Example:

```text
agent working context: 30k
compaction threshold:  24k
reserved output:        6k
```

Tune based on actual model behavior.

---

## 14. Decide public-run persistence

Determine:

- whether all runs get public URLs,
- whether runs expire,
- whether users can delete them,
- whether prompts are publicly discoverable,
- whether replay URLs are unlisted.

For a portfolio demo, unlisted run URLs are probably sufficient.

---

## 15. Add abuse / cost protection

Because this is a public demo, manually decide and configure:

- IP rate limits (e.g. hashed IP stored in Supabase)
- CAPTCHA / bot protection (e.g. Vercel BotID)
- request quotas
- maximum input size
- tool restrictions
- model spending limits
- scraping limits

This is important before sharing widely.

---

## 16. Create polished demo examples

Prepare several prebuilt prompts that reliably show different harness behaviors.

Examples should intentionally demonstrate:

- parallel agents,
- disagreement,
- tool usage,
- looping,
- model routing,
- compaction,
- HITL.

These can appear as clickable examples on the landing page.

---

## 17. Create one deterministic showcase run

Produce at least one especially polished saved run for recruiters.

The landing page can offer:

> "Watch an example run"

This guarantees that viewers see the best version of the experience even if they do not wait for a live run.

---

## 18. Decide deployment infrastructure

Likely:

- Vercel for Next.js
- Supabase for persistence

However, verify whether the chosen runtime supports the desired maximum agent-run duration.
We may need Trigger.dev or some other platform for long-running tasks, or where task retries/depencencies, long timeouts, etc. are important.

Long-running orchestration may require:

- background execution,
- durable functions,
- queue/workflow infrastructure,
- or shorter bounded runs.

Make this architectural decision after testing the MVP.

We will probably need Trigger.dev for some parts of the implementation.

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