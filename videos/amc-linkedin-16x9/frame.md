---
version: 1
name: Agent Mission Control — Frame (video layer)
description: >
  Video companion to the Agent Mission Control web app. Atoms are taken verbatim from the product
  (app/globals.css, app/layout.tsx, src/components/theme.tsx): a near-black "void" ground with a faint
  32px grid, hairline HUD panels with corner brackets, signal amber as the single voltage, and role
  colours that always mean the same agent role. Barlow Condensed (uppercase, tracked) is the display
  and label voice, Geist the reading voice, Geist Mono the data voice.
unit: the frame, 1080x1350 (4:5, LinkedIn feed)
principle: the film looks like the product, because it is the product

colors:
  void: "#06080b"         # ground (globals.css --color-void)
  panel: "#0b0f14"
  panel-2: "#10161d"
  panel-3: "#161e27"
  line: "#1a232d"         # hairline
  line-bright: "#2b3a49"
  ink: "#dce4ec"          # primary text
  ink-dim: "#8896a6"      # secondary text
  ink-faint: "#5a6878"    # labels
  signal: "#ffb547"       # the voltage: brand mark, CTA, progress, scan line
  role-orchestrator: "#e8f1ff"
  role-researcher: "#4fd1e6"
  role-skeptic: "#ff6b5a"
  role-verifier: "#9be564"
  role-gap-detector: "#c792ea"
  role-editor: "#ffb547"
  provider-openai: "#4ee0b5"
  provider-anthropic: "#f0986f"

typography:
  headline: { fontFamily: "Barlow Condensed", px: 84, weight: 700, upper: true, lineHeight: 0.96, tracking: "0.005em" }
  display:  { fontFamily: "Barlow Condensed", px: 132, weight: 700, upper: true, lineHeight: 0.9 }
  label:    { fontFamily: "Barlow Condensed", px: 26, weight: 600, upper: true, tracking: "0.14em" }
  sub:      { fontFamily: "Geist", px: 32, weight: 400, lineHeight: 1.3 }
  data:     { fontFamily: "Geist Mono", px: 24, weight: 500, tabular: true }

layout:
  band: "y 0–318: chapter row at y 46, headline from y 92, sub under it"
  window: "x 24–1056, y 330–1322 (1032x992), the footage viewport, HUD panel with corner brackets"
  spine: "y 1332–1338, replay scrubber across x 24–1056, chapter ticks in role colours"
  pad: 44

fonts:
  - assets/fonts/BarlowCondensed-500.woff2
  - assets/fonts/BarlowCondensed-600.woff2
  - assets/fonts/BarlowCondensed-700.woff2
  - assets/fonts/Geist-var.woff2 (100–900)
  - assets/fonts/GeistMono-var.woff2 (100–900)
---

# Agent Mission Control — Frame

## Overview

The product is a dark mission-control HUD, so the film is one too. The ground is the app's own
void with its 32px grid and two soft radial glows (cyan top right, amber bottom left). Content sits in
hairline HUD panels with small corner brackets. **Signal amber is the only voltage.** It marks
the brand glyph ◎, the progress spine, the chapter counter, the scan line on chapter changes and the
CTA URL. Every other colour is a **role colour** and only ever means its role: cyan for researchers,
coral for skeptics, lime for verifiers, violet for the gap detector, amber for the editor, ice for the
orchestrator. Provider colours (openai mint, anthropic peach) only mark models.

## Type voices

- **Barlow Condensed 700, uppercase**: headlines and the end-card display. It is the app's own
  display face (the landing page's "WATCH AI AGENTS WORK AS A TEAM.").
- **Barlow Condensed 600, uppercase, 0.14em tracking**: labels and chapter names (the app's `.label`).
- **Geist 400**: one supporting sentence per beat, in ink-dim.
- **Geist Mono 500, tabular**: numbers, event types, URLs and chapter counters (the app's `.num`).

In-feed sizes: headline 84px or more, sub 32px or more, data labels 24px or more.

## Do

- Keep the void ground and grid on every frame, and use the same background everywhere.
- Frame footage in the HUD window with corner brackets, and keep captions in the band above it.
- Use exactly one amber moment per frame beyond the persistent spine.
- Colour a caption's accent word with the role colour it talks about.

## Don't

- No gradient text, no neon glow on type, no pure black or white.
- No new hues outside the palette, and no role colour used decoratively.
- No full-screen linear gradients (they band under H.264). Use radial glows only.
- No fabricated numbers. Every figure comes from `capture/stats.json`.

## @font-face

```css
@font-face { font-family: "Barlow Condensed"; font-weight: 500; src: url("assets/fonts/BarlowCondensed-500.woff2") format("woff2"); }
@font-face { font-family: "Barlow Condensed"; font-weight: 600; src: url("assets/fonts/BarlowCondensed-600.woff2") format("woff2"); }
@font-face { font-family: "Barlow Condensed"; font-weight: 700; src: url("assets/fonts/BarlowCondensed-700.woff2") format("woff2"); }
@font-face { font-family: "Geist"; font-weight: 100 900; src: url("assets/fonts/Geist-var.woff2") format("woff2"); }
@font-face { font-family: "Geist Mono"; font-weight: 100 900; src: url("assets/fonts/GeistMono-var.woff2") format("woff2"); }
```
