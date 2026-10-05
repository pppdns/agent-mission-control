import Image from "next/image";

export function BuiltBy() {
  return (
    <a
      href="https://www.linkedin.com/in/denespapp/"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Built by Denes Papp. Open his LinkedIn profile"
      className="group inline-flex shrink-0 items-center gap-2 text-[11.5px] text-ink-faint transition hover:text-signal"
    >
      <Image
        src="/denes-profile-picture.png"
        alt=""
        width={24}
        height={24}
        className="h-6 w-6 rounded-full border border-line object-cover object-top"
      />
      <span>
        Built by <span className="text-ink transition group-hover:text-signal">Denes Papp</span>
      </span>
    </a>
  );
}
