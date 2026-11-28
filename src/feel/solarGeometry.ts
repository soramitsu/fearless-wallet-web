// The solar geometry behind the crow (brand kit v3: tokens/solar-geometry.json, copied verbatim to
// src/assets/brand/solar-geometry.json): its strokes and the order the Ignite draws them in, and its paths for markup.
// The seal draws it on a canvas, stage by stage (src/feel/shikibanDraw.ts).
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

/** After its ignite the figure rests at a quarter of its strength. */
export const IGNITE_REST = 0.25;

/** How much of a stroke is drawn at ignite progress `p` (0-1). */
export function strokeProgress(reveal: readonly [number, number], p: number): number {
  const [start, end] = reveal;
  if (p <= start) return 0;
  if (p >= end || end <= start) return 1;
  return (p - start) / (end - start);
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
