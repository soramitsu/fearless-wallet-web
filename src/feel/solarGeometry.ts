// The solar geometry behind the crow (brand kit v3: tokens/solar-geometry.json, copied verbatim to
// src/assets/brand/solar-geometry.json): its strokes, the order the Ignite draws them in, and two ways to draw it.
import geometry from '@/assets/brand/solar-geometry.json';

type Line = { type: 'line'; group: string; x1: number; y1: number; x2: number; y2: number; weight: number; reveal: [number, number] };
type Circle = { type: 'circle'; group: string; cx: number; cy: number; r: number; weight: number; reveal: [number, number] };
export type SolarStroke = Line | Circle;
export interface SolarGeometry {
  stroke: { core: number; glow: number };
  colors: { core: string; glow: string; star: string };
  strokes: SolarStroke[];
  ticks: { count: number; r: number; size: number; appearsAt: number; turnsPerSecond: number };
  stars: Array<{ x: number; y: number; size: number; reveal: number }>;
}

export const SOLAR = geometry as unknown as SolarGeometry;

/** The ignite draws in 0.9 s, then the figure rests at a quarter of its strength. */
export const IGNITE_MS = 900;
export const IGNITE_FADE_MS = 700;
export const IGNITE_REST = 0.25;

/** How much of a stroke is drawn at ignite progress `p` (0-1). */
export function strokeProgress(reveal: readonly [number, number], p: number): number {
  const [start, end] = reveal;
  if (p <= start) return 0;
  if (p >= end || end <= start) return 1;
  return (p - start) / (end - start);
}

/** Draws the figure at ignite progress `p` into a 2D context centred on (cx, cy) with outer radius r. */
export function drawSolar(
  ctx: CanvasRenderingContext2D,
  { cx, cy, r, p, strength = 1, turn = 0 }: { cx: number; cy: number; r: number; p: number; strength?: number; turn?: number }
): void {
  const { stroke, colors, strokes, ticks, stars } = SOLAR;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  for (const pass of ['glow', 'core'] as const) {
    ctx.strokeStyle = colors[pass];
    ctx.globalAlpha = (pass === 'glow' ? 0.35 : 1) * strength;
    for (const item of strokes) {
      const k = strokeProgress(item.reveal, p);
      if (k <= 0) continue;
      ctx.lineWidth = Math.max(0.6, stroke[pass] * item.weight * r * (pass === 'glow' ? 0.5 : 1.6));
      ctx.beginPath();
      if (item.type === 'line') {
        ctx.moveTo(cx + item.x1 * r, cy + item.y1 * r);
        ctx.lineTo(cx + (item.x1 + (item.x2 - item.x1) * k) * r, cy + (item.y1 + (item.y2 - item.y1) * k) * r);
      } else {
        // From 12 o'clock, anticlockwise on screen, as the kit draws it.
        ctx.arc(cx + item.cx * r, cy + item.cy * r, item.r * r, -Math.PI / 2, -Math.PI / 2 - k * Math.PI * 2, true);
      }
      ctx.stroke();
    }
  }
  if (p >= ticks.appearsAt) {
    ctx.fillStyle = colors.core;
    ctx.globalAlpha = Math.min(1, (p - ticks.appearsAt) / 0.14) * 0.9 * strength;
    for (let i = 0; i < ticks.count; i++) {
      const a = turn + (i / ticks.count) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * ticks.r * r, cy + Math.sin(a) * ticks.r * r, Math.max(0.6, ticks.size * r), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const star of stars) {
    const k = strokeProgress([star.reveal - 0.04, star.reveal + 0.03], p);
    if (k <= 0) continue;
    const size = star.size * r * 0.5 * (0.6 + 0.4 * k);
    const gradient = ctx.createRadialGradient(cx + star.x * r, cy + star.y * r, 0, cx + star.x * r, cy + star.y * r, size);
    gradient.addColorStop(0, colors.star);
    gradient.addColorStop(0.25, colors.core);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = k * strength;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx + star.x * r, cy + star.y * r, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** SVG path data for one group of strokes, in a viewBox of -1 -1 2 2. */
export function solarPath(groups: readonly string[]): string {
  const f = (v: number) => Number(v.toFixed(4));
  return SOLAR.strokes
    .filter((item) => groups.includes(item.group))
    .map((item) =>
      item.type === 'line'
        ? `M${f(item.x1)} ${f(item.y1)}L${f(item.x2)} ${f(item.y2)}`
        : `M${f(item.cx)} ${f(item.cy - item.r)}a${f(item.r)} ${f(item.r)} 0 1 0 0 ${f(item.r * 2)}a${f(item.r)} ${f(item.r)} 0 1 0 0 ${f(-item.r * 2)}`
    )
    .join('');
}

/** The tick ring as SVG circles' centres, in the same viewBox. */
export function solarTicks(): Array<{ x: number; y: number; r: number }> {
  const { count, r, size } = SOLAR.ticks;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Number((Math.cos(a) * r).toFixed(4)), y: Number((Math.sin(a) * r).toFixed(4)), r: size };
  });
}
