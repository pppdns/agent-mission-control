import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/run-view";
import { supabase } from "@/server/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mission run · Agent Mission Control",
  robots: { index: false, follow: false, nocache: true },
};

export default async function RunPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ play?: string }> }) {
  const { id } = await params;
  const { play } = await searchParams;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) notFound();
  const autoplay = play === "1";

  // End-to-end tests serve the event stream from a recorded log, so no database row is needed.
  if (process.env.E2E_FIXTURES === "1" && id.startsWith("fixture-")) {
    return <RunView key={id} runId={id} initialPrompt="Recorded fixture run" initialStatus="completed" initialError={null} autoplay={autoplay} />;
  }

  const { data: run } = await supabase().from("runs").select("id, prompt, status, hidden, error").eq("id", id).maybeSingle();
  if (!run || run.hidden) notFound();

  return <RunView key={run.id} runId={run.id} initialPrompt={run.prompt} initialStatus={run.status} initialError={run.error} autoplay={autoplay} />;
}
