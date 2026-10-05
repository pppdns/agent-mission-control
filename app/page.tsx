import Link from "next/link";
import { HeroOrbit } from "@/components/hero-orbit";
import { PromptForm } from "@/components/prompt-form";
import { liveBudgetLeft } from "@/server/guard";
import { supabase } from "@/server/supabase";

export const dynamic = "force-dynamic";

interface Featured {
  id: string;
  title: string | null;
  prompt: string;
  task_class: string | null;
  totals: { costUsd?: number; llmCalls?: number; inputTokens?: number; outputTokens?: number } | null;
}

async function loadFeatured(): Promise<Featured[]> {
  try {
    const { data } = await supabase()
      .from("runs")
      .select("id, title, prompt, task_class, totals")
      .eq("featured", true)
      .eq("hidden", false)
      .eq("status", "completed")
      .order("featured_order", { ascending: true })
      .limit(12);
    return (data ?? []) as Featured[];
  } catch {
    return [];
  }
}

async function loadBudgetOpen(): Promise<boolean> {
  try {
    return await liveBudgetLeft();
  } catch {
    return true;
  }
}

export default async function Home() {
  const [featured, budgetOpen] = await Promise.all([loadFeatured(), loadBudgetOpen()]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <div className="flex items-center gap-2.5">
          <span className="text-signal" aria-hidden>
            ◎
          </span>
          <span className="font-display text-[16px] font-semibold uppercase tracking-[0.16em]">Agent Mission Control</span>
        </div>
        <span className="label hidden sm:block">live multi-agent runtime</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-12 px-6 pb-16 pt-6 sm:px-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:pt-14">
        <section>
          <p className="label !text-signal">Inspectable by design</p>
          <h1 className="mt-4 font-display text-[clamp(2.8rem,7vw,5.2rem)] font-semibold uppercase leading-[0.92] tracking-[0.01em] text-ice">
            Watch AI agents
            <br />
            work as a team.
          </h1>
          <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-ink-dim">
            Give it a hard question. An orchestrator assembles a team of agents that plan, research, argue, and write, while every
            message, tool call, token, and dollar stays visible.
          </p>

          <div className="mt-9 max-w-2xl">
            {budgetOpen ? (
              <PromptForm />
            ) : (
              <div className="hud px-5 py-4 text-[14px] text-ink-dim">
                Today&apos;s live-demo budget is used up. Watch a replay below, or come back tomorrow.
              </div>
            )}
          </div>
        </section>

        <aside className="flex flex-col items-center gap-6">
          <HeroOrbit />
          <dl className="grid w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-[3px] border border-line bg-line text-center">
            {[
              ["3", "models routed"],
              ["2", "MCP tool servers"],
              ["1", "shared live brief"],
            ].map(([n, label]) => (
              <div key={label} className="bg-panel px-2 py-3">
                <dt className="num text-xl text-signal">{n}</dt>
                <dd className="label mt-1 !text-[9px]">{label}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </main>

      {featured.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 sm:px-10">
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <h2 className="font-display text-[18px] font-semibold uppercase tracking-[0.14em]">Featured runs</h2>
            <span className="label">replay costs nothing</span>
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {featured.map((run, i) => (
              <li key={run.id}>
                <Link href={`/run/${run.id}?play=1`} className="hud group flex h-full flex-col gap-2 p-4 transition hover:border-signal/50">
                  <div className="flex items-center gap-2">
                    {i === 0 && <span className="label !text-signal">Watch an example run</span>}
                    {run.task_class && <span className="label ml-auto">{run.task_class}</span>}
                  </div>
                  <span className="text-[15px] leading-snug text-ink group-hover:text-ice">{run.title ?? run.prompt}</span>
                  <span className="num mt-auto text-[11px] text-ink-faint">
                    ${(run.totals?.costUsd ?? 0).toFixed(3)} · {run.totals?.llmCalls ?? 0} LLM calls ·{" "}
                    {(((run.totals?.inputTokens ?? 0) + (run.totals?.outputTokens ?? 0)) / 1000).toFixed(1)}k tokens
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="border-t border-line px-6 py-4 text-[11.5px] text-ink-faint sm:px-10">
        Custom TypeScript agent harness · OpenAI + Anthropic · Tavily and Firecrawl over MCP · Supabase · Trigger.dev
      </footer>
    </div>
  );
}
