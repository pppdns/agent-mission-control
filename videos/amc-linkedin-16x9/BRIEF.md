---
workflow: general-video
flow: companion
storyboard: yes
message: "I built a multi-agent harness from scratch. You can watch every decision it makes, and try it yourself."
destination: linkedin-feed
aspect: 1080x1350
language: en
length: 75s
angle: show-it-as-is showcase of real recorded runs
---

## Intent

The main LinkedIn showcase for Agent Mission Control (agentmissioncontrol.dev). It shows how an agent
harness and multi-agent orchestration work, built from scratch, and that anyone can try it and play with
it. The viewers are people hiring for applied AI engineering work, but the video never addresses them
directly. It must not look like a ChatGPT wrapper or a hard-coded static flow. Attention spans are
short, so the first three seconds have to be spectacular.

## Assets

- capture/runs/*.json — real event logs of recorded public runs, exported read-only from Supabase.
- clips/*.mp4 — deterministic, frame-stepped screen captures of the real app replaying those runs.
- capture/stats.json — numbers computed from the event logs; every on-screen stat comes from here.
- assets/denes.png — profile photo for the end card (from public/denes-profile-picture.png).

## Customizations

- Real UI footage only, reframed with punch-ins and pans for a phone-sized 4:5 frame.
- 2x2 grid of four different runs to prove the team changes per question.
- Kinetic burned-in captions; animated architecture strip; data callouts from stats.json.
- End card: agentmissioncontrol.dev, github.com/pppdns/agent-mission-control, "Built by Denes Papp".

## Notes

- Silent: no music, no voiceover, no SFX.
- No manual work from the user: capture is scripted with Playwright.
- Do not call out recruiters or employers in the copy.
- Look follows the app's dark HUD palette and role colours.
