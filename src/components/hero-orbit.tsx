const NODES = [
  { id: "r1", x: 70, y: 92, color: "#4fd1e6", label: "researcher" },
  { id: "r2", x: 330, y: 92, color: "#4fd1e6", label: "researcher" },
  { id: "sk", x: 70, y: 252, color: "#ff6b5a", label: "skeptic" },
  { id: "vf", x: 330, y: 252, color: "#9be564", label: "verifier" },
];
const CENTER = { x: 200, y: 36 };
const EDITOR = { x: 200, y: 332 };

export function HeroOrbit() {
  const links = [
    ...NODES.map((n) => ({ from: CENTER, to: n, color: "#b9c7d8", delay: 0 })),
    ...NODES.map((n, i) => ({ from: n, to: EDITOR, color: n.color, delay: 1.2 + i * 0.5 })),
    { from: NODES[2], to: NODES[0], color: "#ff6b5a", delay: 2.4 },
  ];
  return (
    <svg viewBox="0 0 400 370" className="h-auto w-full max-w-md" role="img" aria-label="Illustration: an orchestrator delegating to researchers, a skeptic and a verifier, who feed an editor">
      {links.map((l, i) => {
        const path = `M${l.from.x},${l.from.y} L${l.to.x},${l.to.y}`;
        return (
          <g key={i}>
            <path d={path} stroke="#2b3a49" strokeWidth="1.2" strokeDasharray="4 5" fill="none" />
            <circle r="3.5" fill={l.color} style={{ filter: `drop-shadow(0 0 5px ${l.color})` }}>
              <animateMotion dur="2.6s" begin={`${l.delay}s`} repeatCount="indefinite" path={path} />
            </circle>
          </g>
        );
      })}
      {[...NODES, { id: "orch", ...CENTER, color: "#e8f1ff", label: "orchestrator" }, { id: "ed", ...EDITOR, color: "#ffb547", label: "editor" }].map((n) => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r="17" fill="#0b0f14" stroke={n.color} strokeWidth="1.2" />
          <circle cx={n.x} cy={n.y} r="17" fill="none" stroke={n.color} strokeWidth="1" opacity="0.5">
            <animate attributeName="r" values="17;30" dur="2.8s" repeatCount="indefinite" begin={`${(n.x + n.y) % 5 * 0.3}s`} />
            <animate attributeName="opacity" values="0.5;0" dur="2.8s" repeatCount="indefinite" begin={`${(n.x + n.y) % 5 * 0.3}s`} />
          </circle>
          <circle cx={n.x} cy={n.y} r="3.5" fill={n.color} />
          <text x={n.x} y={n.y + 34} textAnchor="middle" fill="#5a6878" fontSize="9.5" style={{ letterSpacing: "0.14em", textTransform: "uppercase" }}>
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
