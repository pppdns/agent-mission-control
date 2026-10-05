import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunView } from "@/components/run-view";
import { supabase } from "@/server/supabase";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mission run · Agent Mission Control",
  robots: { index: false, follow: false, nocache: true },
};

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) notFound();

  const { data: run } = await supabase().from("runs").select("id, prompt, status, hidden").eq("id", id).maybeSingle();
  if (!run || run.hidden) notFound();

  return <RunView runId={run.id} initialPrompt={run.prompt} initialStatus={run.status} />;
}
