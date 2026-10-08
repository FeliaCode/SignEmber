"use client";
// Pixel-art seascape drawn at low resolution and scaled up crisp: pink banded sky, white clouds, a sun on the
// horizon, the sea with wave dashes and a glint path, a sailboat, and a lighthouse whose lamp is EmberSign's light. Static (no animation), so text can sit on its calm sky. Colours come from CSS tokens.
import { useEffect, useRef } from "react";

const W = 320;

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x1_0000_0000;
  };
}

function tokens(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const t = (n: string) => `hsl(${cs.getPropertyValue(`--${n}`).trim()})`;
  return {
    sky: [t("sky-1"), t("sky-2"), t("sky-3")],
    cloud: t("cloud"),
    cloudShade: t("cloud-shade"),
    sun: t("sun"),
    sea: [t("sea-3"), t("sea-2"), t("sea-1")],
    foam: t("foam"),
    rock: t("rock"),
    ink: t("foreground"),
    primary: t("primary"),
  };
}

function draw(c: HTMLCanvasElement, H: number, seed: number, horizon: number) {
  const g = c.getContext("2d")!;
  const k = tokens(c);
  const r = rng(seed);
  g.clearRect(0, 0, W, H);

  // sky: three bands with a 2px checker dither between them
  const band = Math.floor((H * horizon) / 3);
  for (let y = 0; y < H; y++) {
    const b = Math.min(2, Math.floor(y / band));
    const edge = y % band > band - 3 && b < 2;
    for (let x = 0; x < W; x += 1) {
      g.fillStyle = edge && (x + y) % 2 === 0 ? k.sky[b + 1] : k.sky[b];
      g.fillRect(x, y, 1, 1);
    }
  }

  // clouds: stacked rounded blobs with a shaded underside
  const clouds = 3 + Math.floor(r() * 2);
  for (let i = 0; i < clouds; i++) {
    const cx = Math.floor(r() * W);
    // clouds sit low over the horizon, clear of the headline area
    const cy = Math.floor(H * horizon - 10 - r() * H * horizon * 0.2);
    const len = 22 + Math.floor(r() * 46);
    for (let j = 0; j < len / 6; j++) {
      const bx = cx + j * 6 - len / 2;
      const rad = 5 + Math.floor(r() * 7);
      for (let y = -rad; y <= rad; y++)
        for (let x = -rad; x <= rad; x++) {
          if (x * x + y * y > rad * rad) continue;
          g.fillStyle = y > rad * 0.35 ? k.cloudShade : k.cloud;
          g.fillRect(bx + x, cy + y, 1, 1);
        }
    }
  }

  const base = Math.floor(H * horizon);
  const disc = (cx: number, cy: number, rad: number, color: string, above = Infinity) => {
    g.fillStyle = color;
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad && cy + y < above) g.fillRect(cx + x, cy + y, 1, 1);
  };

  // sun sitting on the horizon (the sea cuts it)
  const sunX = Math.floor(W * 0.32);
  disc(sunX, base - 2, 13, k.sun, base);

  // sea: three depth bands, lightest at the horizon, dithered edges
  const seaH = H - base;
  for (let y = base; y < H; y++) {
    const d = (y - base) / seaH;
    const b = d < 0.22 ? 0 : d < 0.55 ? 1 : 2;
    const edge = (d > 0.19 && d < 0.22) || (d > 0.52 && d < 0.55);
    for (let x = 0; x < W; x++) {
      g.fillStyle = edge && (x + y) % 2 === 0 ? k.sea[Math.min(2, b + 1)] : k.sea[b];
      g.fillRect(x, y, 1, 1);
    }
  }

  // wave dashes: short near the horizon, longer toward the viewer
  for (let i = 0; i < seaH * 7; i++) {
    const y = base + 2 + Math.floor(Math.pow(r(), 1.3) * (seaH - 2));
    const d = (y - base) / seaH;
    const len = 1 + Math.floor(d * 7 * r());
    const x = Math.floor(r() * W);
    g.fillStyle = r() < 0.55 ? k.foam : k.sea[0];
    g.fillRect(x, y, len, 1);
  }

  // glint path under the sun
  for (let y = base + 1; y < H; y += 2) {
    const d = (y - base) / seaH;
    const spread = 4 + d * 26;
    for (let n = 0; n < 2 + d * 4; n++) {
      const x = Math.floor(sunX + (r() - 0.5) * spread * 2);
      g.fillStyle = k.sun;
      g.fillRect(x, y, 1 + Math.floor(r() * (2 + d * 4)), 1);
    }
  }

  // sailboat on the far water
  const bx = Math.floor(W * 0.56);
  const by = base + 5;
  g.fillStyle = k.ink;
  g.fillRect(bx - 5, by, 11, 2);
  g.fillRect(bx - 3, by + 2, 7, 1);
  g.fillRect(bx, by - 11, 1, 11);
  g.fillStyle = k.cloud;
  for (let y = 0; y < 9; y++) g.fillRect(bx + 1, by - 10 + y, Math.ceil((y + 1) * 0.6), 1);

  // lighthouse on a rock, its lamp is EmberSign's light
  const lx = Math.floor(W * 0.84);
  const rockTop = base + Math.floor(seaH * 0.35);
  g.fillStyle = k.rock;
  for (let y = rockTop; y < rockTop + 12; y++) {
    const half = 8 + (y - rockTop) * 1.4;
    g.fillRect(Math.floor(lx - half), y, Math.floor(half * 2), 1);
  }
  g.fillStyle = k.foam;
  g.fillRect(lx - 22, rockTop + 11, 44, 1);
  for (let y = 0; y < 26; y++) {
    const half = 3 + Math.floor(y / 9);
    g.fillStyle = Math.floor(y / 5) % 2 === 0 ? k.cloud : k.primary;
    g.fillRect(lx - half, rockTop - 26 + y, half * 2 + 1, 1);
  }
  g.fillStyle = k.ink;
  g.fillRect(lx - 4, rockTop - 33, 9, 1);
  g.fillRect(lx - 3, rockTop - 32, 7, 6);
  g.fillStyle = k.primary;
  g.fillRect(lx - 2, rockTop - 31, 5, 4);
  g.fillStyle = k.sun;
  g.fillRect(lx - 1, rockTop - 30, 3, 2);
  // the lamp's beam across the sky
  g.fillStyle = k.sun;
  for (let x = 1; x < 70; x++) {
    if (x % 3 === 0) continue;
    const y = rockTop - 30 - Math.floor(x * 0.18);
    g.fillRect(lx - 4 - x, y, 1, 1);
  }
}

/** Fills its box without stretching: the low-res canvas takes the box's aspect ratio (W fixed, height derived). */
export function PixelScene({ seed = 7, horizon = 0.62, className, label }: { height?: number; seed?: number; horizon?: number; className?: string; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      const box = c.parentElement!.getBoundingClientRect();
      const h = Math.max(60, Math.round((W * box.height) / Math.max(1, box.width)));
      if (c.height !== h) c.height = h;
      draw(c, h, seed, horizon);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(c.parentElement!);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const obs = new MutationObserver(paint);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    mq.addEventListener("change", paint);
    return () => {
      ro.disconnect();
      obs.disconnect();
      mq.removeEventListener("change", paint);
    };
  }, [seed, horizon]);
  return <canvas ref={ref} width={W} height={180} role="img" aria-label={label} className={`pixelated block h-full w-full ${className ?? ""}`} />;
}
