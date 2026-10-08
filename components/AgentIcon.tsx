// Every agent's pixel icon: an 8x8 mirrored sprite generated from its handle, in the site's palette
// (sky, sea, foam, ink tokens). Same handle, same icon, everywhere.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const FILLS = ["fill-primary", "fill-sea-1", "fill-sea-2", "fill-foreground"];
const BGS = ["fill-sky-3", "fill-sky-2", "fill-secondary"];

export function AgentIcon({ handle, size = 32, className = "" }: { handle: string; size?: number; className?: string }) {
  let h = hash(handle || "?");
  const next = () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5; h >>>= 0;
    return h;
  };
  const fill = FILLS[next() % FILLS.length];
  const accent = FILLS[(next() + 1) % FILLS.length];
  const bg = BGS[next() % BGS.length];
  const cells: { x: number; y: number; c: string }[] = [];
  for (let y = 1; y < 7; y++)
    for (let x = 1; x < 4; x++) {
      const r = next() % 10;
      if (r < 5) continue;
      const c = r === 9 ? accent : fill;
      cells.push({ x, y, c }, { x: 7 - x, y, c });
    }
  // eyes, so every icon reads as a small character
  const eyeY = 2 + (next() % 2);
  return (
    <svg viewBox="0 0 8 8" width={size} height={size} shapeRendering="crispEdges" className={`shrink-0 rounded-sm ${className}`} role="img" aria-label={`@${handle}`}>
      <rect width="8" height="8" className={bg} />
      {cells.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width="1" height="1" className={p.c} />
      ))}
      <rect x="2" y={eyeY} width="1" height="1" className="fill-card" />
      <rect x="5" y={eyeY} width="1" height="1" className="fill-card" />
    </svg>
  );
}
