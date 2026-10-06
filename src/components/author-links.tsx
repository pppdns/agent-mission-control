import Image from "next/image";

const PROFILE_URL = "https://www.linkedin.com/in/denespapp/";
const REPO_URL = "https://github.com/pppdns/agent-mission-control";
const ARTICLE_URL = "https://www.linkedin.com/pulse/building-multi-agent-harness-visual-orchestrator-from-denes-papp-atstf";

function GitHubIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="h-3.5 w-3.5 fill-current">
      <path d="M0 1.15C0 .52.52 0 1.18 0h13.64C15.48 0 16 .52 16 1.15v13.7c0 .63-.52 1.15-1.18 1.15H1.18C.52 16 0 15.48 0 14.85V1.15Zm4.94 12.24V6.17H2.54v7.22h2.4ZM3.74 5.18c.84 0 1.36-.55 1.36-1.25-.02-.71-.52-1.25-1.35-1.25-.82 0-1.36.54-1.36 1.25 0 .7.52 1.25 1.33 1.25h.02Zm4.9 8.21V9.36c0-.22.02-.43.08-.59.18-.43.57-.88 1.23-.88.87 0 1.22.66 1.22 1.64v3.86h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.27 0-1.84.7-2.16 1.19v.02h-.02l.02-.02V6.17h-2.4c.03.68 0 7.22 0 7.22h2.4Z" />
    </svg>
  );
}

const linkButton =
  "inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-line bg-panel/70 px-2.5 text-ink-dim transition hover:border-signal-dim hover:text-signal focus-visible:outline focus-visible:outline-1 focus-visible:outline-signal";

export function AuthorLinks() {
  return (
    <nav aria-label="About this project" className="flex shrink-0 items-center gap-2 sm:gap-3">
      <a
        href={PROFILE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Denes Papp on LinkedIn"
        className="group flex items-center gap-2 text-[13px] text-ink transition hover:text-signal"
      >
        <Image
          src="/denes-profile-picture.png"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-full border border-line-bright object-cover object-top transition group-hover:border-signal-dim"
        />
        <span className="hidden md:inline">Denes Papp</span>
      </a>
      <span aria-hidden className="hidden h-5 w-px bg-line md:block" />
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Source code on GitHub" className={linkButton}>
        <GitHubIcon />
        <span className="label hidden !text-current sm:inline">Source</span>
      </a>
      <a
        href={ARTICLE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Read the write-up on LinkedIn"
        className={linkButton}
      >
        <LinkedInIcon />
        <span className="label hidden !text-current sm:inline">Write-up</span>
      </a>
    </nav>
  );
}
