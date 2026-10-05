import { HeroOrbit } from "@/components/hero-orbit";
import { MissionReel } from "@/components/mission-reel";
import { PromptForm } from "@/components/prompt-form";
import { TeamCards } from "@/components/team-cards";
import { loadFeatured } from "@/server/featured";
import { liveBudgetLeft } from "@/server/guard";

export const dynamic = "force-dynamic";

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

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-6 pb-16 pt-6 sm:px-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-12 lg:pt-14">
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

        <aside className="flex min-w-0 flex-col items-center gap-6">
          {featured.length > 0 ? <MissionReel previews={featured} /> : <HeroOrbit />}
          <dl className="hidden w-full max-w-md grid-cols-3 gap-px overflow-hidden rounded-[3px] border border-line bg-line text-center lg:grid">
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
        <section className="mx-auto w-full max-w-6xl overflow-hidden px-6 pb-20 sm:overflow-visible sm:px-10">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
            <h2 className="font-display text-[18px] font-semibold uppercase tracking-[0.14em]">Every question gets its own team</h2>
            <span className="label hidden sm:block">replay costs nothing</span>
          </div>
          <TeamCards previews={featured} />
        </section>
      )}

      <footer className="border-t border-line px-6 py-4 text-[11.5px] text-ink-faint sm:px-10">
        Custom TypeScript agent harness · OpenAI + Anthropic · Tavily and Firecrawl over MCP · Supabase · Trigger.dev
      </footer>
    </div>
  );
}
