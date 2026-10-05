import { failRunExternally, STALE_RUN_MS } from "@/server/runs";
import { supabase } from "@/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const POLL_MS = 700;
const HEARTBEAT_MS = 15_000;
const SESSION_MS = 270_000;
const PAGE = 400;

const NO_STORE = { "cache-control": "no-store, no-transform", "x-robots-tag": "noindex, nofollow" };

/**
 * Server-Sent Events over the persisted event log. Live viewing and replay are the same code path:
 * read events with seq greater than the cursor, then keep following the tail until the run is terminal.
 * Reconnects resume from Last-Event-ID.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = supabase();

  const { data: run } = await db.from("runs").select("id, status, hidden").eq("id", id).maybeSingle();
  if (!run || run.hidden) return new Response("Not found", { status: 404, headers: NO_STORE });

  const url = new URL(request.url);
  const header = request.headers.get("last-event-id");
  let cursor = Number(header ?? url.searchParams.get("after") ?? 0);
  if (!Number.isFinite(cursor) || cursor < 0) cursor = 0;

  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(encoder.encode(chunk));
      let lastWrite = Date.now();
      let closed = false;
      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      send("retry: 1500\n\n");
      try {
        while (!closed && Date.now() - started < SESSION_MS) {
          const { data: rows, error } = await db
            .from("events")
            .select("seq, ts, type, agent_id, data")
            .eq("run_id", id)
            .gt("seq", cursor)
            .order("seq", { ascending: true })
            .limit(PAGE);
          if (error) throw new Error(error.message);

          if (rows && rows.length > 0) {
            for (const row of rows) {
              const payload = { runId: id, seq: row.seq, ts: row.ts, type: row.type, agentId: row.agent_id, data: row.data };
              send(`id: ${row.seq}\ndata: ${JSON.stringify(payload)}\n\n`);
              cursor = row.seq;
            }
            lastWrite = Date.now();
            if (rows.length === PAGE) continue;
          } else {
            const { data: current } = await db.from("runs").select("status, hidden, created_at").eq("id", id).maybeSingle();
            if (!current || current.hidden) break;
            if ((current.status === "queued" || current.status === "running") && Date.now() - Date.parse(current.created_at) > STALE_RUN_MS) {
              await failRunExternally(id, "The run timed out before it finished.");
              continue;
            }
            if (current.status === "completed" || current.status === "failed") {
              const { count } = await db
                .from("events")
                .select("seq", { count: "exact", head: true })
                .eq("run_id", id)
                .gt("seq", cursor);
              if (!count) {
                send(`event: end\ndata: ${JSON.stringify({ status: current.status })}\n\n`);
                break;
              }
              continue;
            }
          }

          if (Date.now() - lastWrite > HEARTBEAT_MS) {
            send(": keep-alive\n\n");
            lastWrite = Date.now();
          }
          await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
      } catch {
        // Closing without an `end` event makes the browser reconnect from Last-Event-ID.
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: { ...NO_STORE, "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" },
  });
}
