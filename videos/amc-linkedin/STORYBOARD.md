---
format: 1080x1350
duration: 77s
message: "I built a multi-agent harness from scratch. You can watch every decision it makes, and try it yourself."
arc: Hook → Plan → Proof (teams, tools, critique, self-evaluation, human, context, result) → Under the hood → Replay → Try it
audience: engineers and hiring teams scrolling a LinkedIn feed, muted
mode: autonomous
music: none
---

# Agent Mission Control, LinkedIn cut (v1)

## Decisions

- **Message:** "I built a multi-agent harness from scratch. You can watch every decision it makes, and try it yourself."
- **Audience and arc:** people who build or hire for applied AI, watching muted in the feed. The arc goes from a busy hook to how a run is planned, then seven proof beats, the engine, replay, and a call to action.
- **Format:** 1080x1350 (4:5), 77 seconds, no voiceover, no music. The silence is deliberate. Captions carry the meaning, and every caption sits in the top band, so no UI text has to be read.
- **Spine:** the film is itself a replay. A persistent HUD frame shows the chapter counter top left (`02 / 12`), the footage window has the app's corner brackets, and a replay scrubber runs along the bottom edge. The scrubber fills across the whole film and carries a role-coloured tick at every chapter, mirroring the app's replay bar.
- **Brand, from the product:** see `frame.md`. The palette and fonts come from `app/globals.css`, `app/layout.tsx` and `src/components/theme.tsx`.
- **Truthfulness:** every footage shot is the real app replaying a real recorded run, captured frame by frame from the exported event logs. Every number on screen is computed from those logs by `capture/stats.mts`. Nothing is mocked.
- **Bans:** no fake product UI (the engine diagram is labelled as a diagram, not as the app), no stock "AI" imagery, no gradient text, no full-screen linear gradients, no fade from black at the open, no static end card (footage keeps playing behind it). Motion failures to avoid are the slideshow (every beat a fresh card with nothing carried over) and the screensaver (camera drift that points at nothing).
- **Held frame:** frame 12 holds the URL still for its last 2 seconds.
- **Seam rule:** footage hard-cuts. Caption text exits upward and the next enters from below. The window border flashes an amber scan line on each chapter change.
- **Registry:** the catalog was searched for kinetic headline, HUD overlay, wipe, diagram, end-card and stat blocks. `headline-slam` (three-frame impact shake) and `telemetry-hud` (attribute-driven bracket draw-on, deterministic value ticks) supply the mechanics. They are re-authored in the product's own HUD tokens, because their default token sets don't match it.

## Frame 1 — Hook

- scene: Full-bleed footage cuts every ~0.8s (busy graph, objections, decision card, brief streaming) under a two-line headline slam
- duration: 4.5s
- poster: 2.2s
- transition_in: cut
- status: animated
- src: compositions/s01-hook.html
- voiceover: onscreen
- blueprint: kinetic-type-beats (adapt), rules kinetic-beat-slam, coordinate-target-zoom

No logo intro, and frame 0 is already busy. The first frame is the Manufacturing Hub graph mid-research with message dots flying, punched in 1.6x. "ASK A HARD QUESTION." slams in within 0.15s. At 1.6s "WATCH AN AI TEAM WORK IT OUT." slams in with the role-coloured word "AI TEAM". There are five hard cuts with alternating punch directions: research graph, the Postgres team spawning, a coral Skeptic objection in the brief, the budget decision card, and the editor writing at 4x. The live counters in the app header (cost, tokens, agents) tick up in every shot. Constraint: no fade-in, and no cut longer than 1s. Why: to stop the scroll on proof that something real and complex is happening.

## Frame 2 — Plan

- scene: The landing prompt types, then the orchestrator appears and spawns its team
- duration: 6.5s
- transition_in: cut
- status: animated
- src: compositions/s02-plan.html
- caption: "AN ORCHESTRATOR PLANS THE WORK" / "and designs a team for this exact question."
- blueprint: prompt-type-submit-generate (cut at the ask), rules coordinate-target-zoom

The landing page's prompt box types "Which country is best positioned to become the next major global manufacturing hub after China?" (punch 1.9x on the left column). Hard cut to the run: the Orchestrator node appears alone, then delegation edges fan out to two researchers, a Skeptic and an Editor. The camera eases from 2.1x on the orchestrator out to 1.6x as the team appears. Constraint: no cursor, and no submit click is faked. Why: the team is designed at runtime.

## Frame 3 — Different teams

- scene: A 2x2 grid of four real runs spawning different teams at once
- duration: 7s
- transition_in: cut
- status: animated
- src: compositions/s03-teams.html
- caption: "DIFFERENT QUESTION, DIFFERENT TEAM" / "Nothing is scripted. The orchestrator decides who to hire."
- blueprint: grid-card-assemble, rules spring-pop-entrance

Four cells (Concorde, React Server Components, Monorepo, Postgres vs ClickHouse) pop in with a 0.08s stagger, each playing its own run's spawn. Each cell has a mono label with the question, and role-coloured composition chips under it, for example "3 researchers · verifier" and "2 researchers · skeptic · verifier". Constraint: the cells are not identical, because each chip row differs. Why: this is the "not a hard-coded flow" proof.

## Frame 4 — Real tools

- scene: Researcher flights to the Tavily MCP node, then the inspector opens on a real web_search call
- duration: 6.5s
- transition_in: cut
- status: animated
- src: compositions/s04-tools.html
- caption: "REAL TOOLS, THE LIVE WEB" / "Researchers search and read through MCP. Every claim cites a source."
- blueprint: camera-journey (A, action roundtrip), rules coordinate-target-zoom

It opens 1.8x on the graph: dashed flights run from the researchers to the Tavily and Firecrawl MCP servers. The inspector opens (real click in the capture). The camera pans right to 1.9x on the inspector: the tool `web_search`, the `tavily / tavily_search` server, the query parameters, the result text, and "SOURCES REGISTERED s1–s5". A cyan callout chip reads "MCP · tavily_search". Why: to show it uses real tools.

## Frame 5 — Cross-model critique

- scene: The Claude Skeptic's objections land in the brief, then the routing tab shows spend by model
- duration: 7s
- transition_in: cut
- status: animated
- src: compositions/s05-critique.html
- caption: "A SECOND MODEL FAMILY ARGUES BACK" / "Researchers run on GPT. Skeptics and verifiers run on Claude."
- blueprint: camera-journey (A), rules coordinate-target-zoom, depth-of-field-blur

It punches 1.9x on the coral Successor Premise Skeptic node with its `claude-sonnet-5-5` badge, then pans to the coral "OBJECTION · MAJOR" blocks in the artifact. Hard cut to the routing tab: the spend-by-model bars and the routing decisions list (`critique_cross_family → claude-sonnet-5-5`). Provider colour chips show openai #4ee0b5 and anthropic #f0986f. Why: this is deliberate orchestration design, not one model talking to itself.

## Frame 6 — Self-evaluation

- scene: The Gap Detector's score card (4.7/10, named gaps), with round 2 assignments
- duration: 6s
- transition_in: cut
- status: animated
- src: compositions/s06-evaluate.html
- caption: "IT GRADES ITS OWN DRAFT" / "Then decides whether to dig deeper. Here: 4.7/10, so round 2."
- blueprint: dataviz-countup (guest stat), rules counting-dynamic-scale

The inspector on the Gap Detector is at 1.8x: score 4.7/10, coverage 2/5, support 2/5, the decision "budget allows another round", and the gaps it named. The camera drifts down to "ROUND 2 ASSIGNMENTS". A violet stamp, "LOOP → ROUND 2", springs in. Why: this is the agent loop, a measured decision to continue.

## Frame 7 — Human in the loop

- scene: The budget decision card appears, and the run waits on a human
- duration: 6s
- transition_in: cut
- status: animated
- src: compositions/s07-human.html
- caption: "IT KNOWS WHEN TO ASK A HUMAN" / "Out of budget with gaps left? The run pauses and asks."
- blueprint: rules coordinate-target-zoom, ambient-glow-bloom

The card is at 1.9x: "The research budget is used up, but gaps remain. Approve a one-time extension?" with "Extend the budget (recommended)" and "Write the brief now", and the countdown ticking. An amber glow blooms behind the card. Why: this is the HITL design, a real pause point.

## Frame 8 — Context and budgets

- scene: A compaction event opens in the inspector: 17.9k → 5.0k tokens, saved 72%
- duration: 7s
- transition_in: cut
- status: animated
- src: compositions/s08-context.html
- caption: "EVERY AGENT MANAGES ITS CONTEXT" / "Per-agent compaction, model routing and hard budgets, all visible."
- blueprint: dataviz-countup (guest), rules coordinate-target-zoom, counting-dynamic-scale

It starts on the research budget meters (web searches 11/11, budget EXTENDED) above an event trace that reads "Evidence Verifier hit the context threshold" and "compacted context · prune". Then the inspector opens on "Evidence Verifier compacted context · prune". The camera pushes to the BEFORE 17.9k / AFTER 5.00k / SAVED 72% cards and the "REMOVED / PRESERVED VERBATIM" lists. Why: this is engineering detail that wrapper apps don't have.

## Frame 9 — The result

- scene: The editor writes the final brief live; FINAL badges flip on; a stats strip lands
- duration: 6.5s
- transition_in: cut
- status: animated
- src: compositions/s09-result.html
- caption: "THE RESULT: A CITED RESEARCH BRIEF" / "Written live. Every claim links back to a retrieved source."
- blueprint: transcript-scroll-artifact-reveal (adapt), rules grid-card-assemble stagger

The artifact panel is at 1.7x as sections flip to FINAL, with source chips [s17][s3][s9]. In the last 2 seconds a stats strip springs in at the bottom of the window: "8 agents · 3 rounds · 54 sources · 25 tool calls · $0.38". Why: the payoff, and the numbers are real.

## Frame 10 — Under the hood

- scene: An animated architecture diagram with events flowing along the wires, and aggregate stats
- duration: 8.5s
- transition_in: cut
- status: animated
- src: compositions/s10-engine.html
- caption: "OWN AGENT LOOP. NOT AN SDK WRAPPER." / "Every step is an event. Live view and replay share one log."
- blueprint: constellation-hub (adapt to a pipeline), rules svg-path-draw, stat-bars-and-fills

The diagram (labelled "ARCHITECTURE") lays out Next.js 16 UI ← SSE ← Postgres event log ← TypeScript agent harness (on Trigger.dev). The harness connects to OpenAI and Anthropic, and to Tavily MCP and Firecrawl MCP. The wires draw on, then real event-type pills rise from the harness into the log, whose sequence counter ticks up (`run.classified`, `agent.spawned`, `routing.decided`, `tool.requested`, `source.added`, `context.compacted`, `evaluation.completed`, `hitl.requested`, …). A stats row ticks up: "10 recorded runs · 4,718 events · 32 event types · 292 routing calls". Constraint: it isn't dressed as app UI. Why: this is the technical credibility beat.

## Frame 11 — Replay

- scene: A fast scrub backwards through the whole run, then forward again
- duration: 5s
- transition_in: cut
- status: animated
- src: compositions/s11-replay.html
- caption: "EVERY RUN IS REPLAYABLE" / "Scrub through any run, event by event. No LLM calls."
- blueprint: rules coordinate-target-zoom, control-target-sync

The graph, artifact and replay bar are framed at 1.2–1.3x while the scrubber rewinds to 00:00 and the graph collapses, then jumps forward to round 2 and rebuilds. Chips: "scrubbing back through the run", then "jump to round 2". Why: inspectability is the product.

## Frame 12 — Try it yourself

- scene: End card over dimmed, still-playing footage: first-person line, URL, GitHub, photo
- duration: 6.5s
- transition_in: cut
- status: animated
- src: compositions/s12-cta.html
- caption: "TRY IT YOURSELF"
- blueprint: titlecard-reveal (CTA chain), rules waterfall-entry

The Manufacturing Hub research footage plays blurred at 22% behind the card. The line "I built this harness from scratch to show how multi-agent orchestration really works." appears, then "TRY IT YOURSELF" slams in. Then "agentmissioncontrol.dev" in amber, "github.com/pppdns/agent-mission-control" in mono, and "Built by Denes Papp" with the profile photo. The last 2 seconds hold still. Why: this is the call to action.
