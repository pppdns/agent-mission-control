"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createRun, type CreateRunState } from "../../app/actions";

const MAX = 2000;

export const EXAMPLES: { label: string; kind: string; prompt: string }[] = [
  {
    kind: "decision",
    label: "SQLite in production?",
    prompt: "Should a five-person startup run SQLite in production?",
  },
  {
    kind: "comparison",
    label: "Postgres vs ClickHouse",
    prompt: "Postgres vs ClickHouse for a product analytics workload of about 2 billion events per month: which should a startup choose?",
  },
  {
    kind: "research",
    label: "Why Concorde failed",
    prompt: "Investigate why Concorde failed commercially.",
  },
  {
    kind: "research",
    label: "Intermittent fasting evidence",
    prompt: "Is intermittent fasting supported by strong evidence?",
  },
  {
    kind: "comparison",
    label: "RSC vs traditional API",
    prompt: "Compare React Server Components with a traditional API architecture.",
  },
];

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="group relative inline-flex h-11 items-center gap-2.5 overflow-hidden rounded-[3px] border border-signal bg-signal px-5 font-display text-[15px] font-semibold uppercase tracking-[0.14em] text-void transition hover:bg-[#ffc56e] disabled:cursor-not-allowed disabled:border-line-bright disabled:bg-panel-3 disabled:text-ink-faint"
    >
      {pending ? (
        <>
          <span className="h-3 w-3 rounded-full border-2 border-void/40 border-t-void" style={{ animation: "orbit 0.8s linear infinite" }} />
          Launching
        </>
      ) : (
        <>
          Launch mission
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </>
      )}
    </button>
  );
}

export function PromptForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action] = useActionState<CreateRunState, FormData>(createRun, { error: null, prompt: "" });
  const [text, setValue] = useState("");

  return (
    <form action={action} className="w-full">
      <div className="hud p-1">
        <label htmlFor="prompt" className="sr-only">
          Your question
        </label>
        <textarea
          id="prompt"
          name="prompt"
          value={text}
          onChange={(e) => setValue(e.target.value)}
          maxLength={MAX}
          rows={3}
          disabled={disabled}
          placeholder="Give the agents a question to research, options to compare, or a decision to analyze."
          className="block w-full resize-none bg-transparent px-4 py-3.5 text-[16px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2">
          <span className="num text-[11px] text-ink-faint">
            {text.length} / {MAX}
          </span>
          <Submit disabled={disabled || text.trim().length < 8} />
        </div>
      </div>

      <p className="mt-2.5 text-[12px] text-ink-faint">Runs are public and permanent. Don&apos;t include personal information.</p>
      {state.error && (
        <p role="alert" className="mt-3 rounded-[3px] border border-coral/40 bg-coral/10 px-3 py-2 text-[13px] text-coral">
          {state.error}
        </p>
      )}

      <div className="mt-6">
        <div className="label mb-2">Try an example</div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={disabled}
              onClick={() => setValue(ex.prompt)}
              className="group flex items-center gap-2 rounded-[3px] border border-line-bright bg-panel/70 px-3 py-1.5 text-[13px] text-ink-dim transition hover:border-signal/60 hover:text-ink disabled:opacity-50"
            >
              <span className="label !text-[9px] group-hover:!text-signal">{ex.kind}</span>
              {ex.label}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}
