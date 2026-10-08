// Salo, EmberSign's salamander: lives in fire and isn't burned. Three poses, one drawing style.
type Pose = "lantern" | "coin" | "rest";

export function Salo({ pose = "lantern", size = 160, className }: { pose?: Pose; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 200 160" width={size} height={(size * 160) / 200} className={className} role="img" aria-label={`Salo the salamander ${pose === "rest" ? "resting" : pose === "coin" ? "carrying a coin" : "holding a lantern"}`}>
      {/* body */}
      <path
        d={
          pose === "rest"
            ? "M30 118c18-14 40-18 62-14 20 4 36 2 52-8 12-8 26-6 32 4 5 9-2 18-14 20-20 4-30 14-54 18-30 5-62 2-78-6-6-4-6-10 0-14z"
            : "M36 112c14-20 34-30 58-30 18 0 30-6 40-18 10-12 28-14 38-4 9 9 6 24-6 30-14 7-20 20-34 30-22 15-58 18-82 8-10-4-18-8-14-16z"
        }
        className="fill-primary"
      />
      {/* tail curl */}
      <path d={pose === "rest" ? "M30 118c-14 6-20 18-10 24 8 4 16-2 14-10" : "M38 110c-16 2-26 14-18 24 7 8 18 2 16-8"} className="fill-none stroke-primary" strokeWidth="9" strokeLinecap="round" />
      {/* spots */}
      <circle cx={pose === "rest" ? 80 : 84} cy={pose === "rest" ? 114 : 104} r="5" className="fill-warning" />
      <circle cx={pose === "rest" ? 108 : 110} cy={pose === "rest" ? 110 : 96} r="4" className="fill-warning" />
      {/* legs */}
      <path d={pose === "rest" ? "M70 124l-6 12M120 118l6 12" : "M66 120l-8 16M118 112l4 18M150 86l14 10"} className="stroke-primary" strokeWidth="7" strokeLinecap="round" />
      {/* eye */}
      <circle cx={pose === "rest" ? 162 : 160} cy={pose === "rest" ? 104 : 62} r="5" className="fill-card" />
      <circle cx={pose === "rest" ? 163 : 161} cy={pose === "rest" ? 104 : 62} r={pose === "rest" ? 1.2 : 2.4} className="fill-foreground" />
      {pose === "lantern" && (
        <g>
          <path d="M150 96l10 22" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" />
          <rect x="150" y="118" width="22" height="26" rx="5" className="fill-card stroke-foreground" strokeWidth="3" />
          <path d="M161 124c-5 6-4 12 0 14 4-2 5-8 0-14z" className="fill-primary" />
        </g>
      )}
      {pose === "coin" && (
        <g>
          <circle cx="176" cy="94" r="14" className="fill-warning stroke-foreground" strokeWidth="3" />
          <path d="M176 86v16M171 90h8a3 3 0 010 6h-6a3 3 0 000 6h8" className="fill-none stroke-foreground" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
