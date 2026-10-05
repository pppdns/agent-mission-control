/**
 * Shot list for the capture. Times are replay positions in ms (the replay bar's compressed timeline at 1x)
 * or seconds of recorded footage for actions. Every shot replays a real recorded run.
 */

export const MAIN = "II5BY5a8DYtL7Q__";

export type Action =
  | { at: number; type: "click"; selector: string; text?: string }
  | { at: number; type: "speed"; value: 1 | 2 | 4 }
  | { at: number; type: "pause" }
  | { at: number; type: "type"; selector: string; text: string; cps: number }
  | { at: number; type: "scrub"; from: number; to: number; seconds: number }
  | { at: number; type: "scroll"; selector: string; to: "top" | "bottom" };

export interface Shot {
  id: string;
  kind: "replay" | "live" | "landing";
  run?: string;
  /** Replay position to seek to before recording (replay shots). */
  seek?: number;
  speed?: 1 | 2 | 4;
  /** Live shots: serve the log up to this event count, as if the run were still in progress. */
  liveCursor?: number;
  /** Footage seconds to step before recording starts (lets fitView and seeks settle). */
  warm?: number;
  seconds: number;
  actions?: Action[];
}

const TRACE = '[role="log"] button';

export const SHOTS: Shot[] = [
  { id: "main-start", kind: "replay", run: MAIN, seek: 0, speed: 1, warm: 0, seconds: 9 },
  { id: "main-research", kind: "replay", run: MAIN, seek: 3500, speed: 2, seconds: 10 },
  {
    id: "main-tool",
    kind: "replay",
    run: MAIN,
    seek: 9000,
    speed: 1,
    seconds: 7,
    actions: [{ at: 0.6, type: "click", selector: TRACE, text: "web_search · tavily MCP" }],
  },
  { id: "main-critique", kind: "replay", run: MAIN, seek: 61500, speed: 1, seconds: 9 },
  {
    id: "main-eval",
    kind: "replay",
    run: MAIN,
    seek: 68200,
    speed: 1,
    seconds: 6,
    actions: [
      { at: 0, type: "pause" },
      { at: 0.5, type: "click", selector: TRACE, text: "Gap Detector · 4.7/10" },
    ],
  },
  {
    id: "main-routing",
    kind: "replay",
    run: MAIN,
    seek: 100000,
    speed: 2,
    seconds: 6,
    actions: [{ at: 0.4, type: "click", selector: '[role="tab"]', text: "routing" }],
  },
  { id: "main-hitl", kind: "live", run: MAIN, liveCursor: 395, warm: 1, seconds: 7 },
  {
    id: "main-compaction",
    kind: "replay",
    run: MAIN,
    seek: 131800,
    speed: 1,
    seconds: 8,
    actions: [{ at: 2.6, type: "click", selector: TRACE, text: "compacted context · prune" }],
  },
  { id: "main-editor", kind: "replay", run: MAIN, seek: 156000, speed: 4, seconds: 10 },
  {
    id: "main-scrub",
    kind: "replay",
    run: MAIN,
    seek: 193000,
    speed: 1,
    warm: 1.5,
    seconds: 6,
    actions: [
      { at: 0.4, type: "scrub", from: 193000, to: 0, seconds: 2.2 },
      { at: 3.2, type: "scrub", from: 0, to: 67800, seconds: 1.6 },
    ],
  },
  { id: "grid-concorde", kind: "replay", run: "PVeHwxLPGK68xWvW", seek: 0, speed: 2, warm: 0, seconds: 9 },
  { id: "grid-rsc", kind: "replay", run: "i82vAV6MpnMMXge8", seek: 0, speed: 2, warm: 0, seconds: 9 },
  { id: "grid-monorepo", kind: "replay", run: "BJGMsm7DWmFrPxyG", seek: 0, speed: 2, warm: 0, seconds: 9 },
  { id: "grid-postgres", kind: "replay", run: "upyPZBCKas1ZKzJR", seek: 0, speed: 2, warm: 0, seconds: 9 },
  {
    id: "landing",
    kind: "landing",
    warm: 0.5,
    seconds: 6,
    actions: [
      {
        at: 0.5,
        type: "type",
        selector: "textarea",
        text: "Which country is best positioned to become the next major global manufacturing hub after China?",
        cps: 24,
      },
    ],
  },
];
