// Shikiban (brand kit v4, SPEC "Shikiban: depth, instruments and sacred geometry"): the wallet's instrument language.
// A shikiban is the onmyoji's cosmograph, a round heaven plate turning over a square earth plate. Three rules:
//   1. Round heaven, square earth: every size and duration steps by 1/sqrt(2) (the yamato ratio).
//   2. Depth is one law: a thing at depth z is drawn scaled by p / (p + z) about the focus point.
//   3. Motion reports: a stroke that draws is progress, a lit segment a finished share, turning is work in flight.
// The numbers are the kit's (tokens/shikiban.json, copied verbatim to src/assets/brand/shikiban.json); the formulas
// here are the kit's tools/shikiban.mjs, and the unit tests hold them to the kit's sampled keyframes.
import tokens from '@/assets/brand/shikiban.json';

export interface ShikibanTokens {
  ratio: { yamato: number; ladder: number[] };
  durationsMs: number[];
  easing: Record<'settle' | 'depart' | 'glide', [number, number, number, number]>;
  colors: Record<'core' | 'glow' | 'star' | 'flight' | 'failure' | 'rest', string>;
  depth: { perspective: number };
  mirror: {
    lobes: number;
    lobeRadius: number;
    lobeCentre: number;
    cusp: number;
    rim: Array<{ cx: number; cy: number; r: number; from: number; to: number }>;
  };
  gates: Array<{ figure: 'plate' | 'mirror'; diamond?: boolean; depth: number; square?: Array<[number, number]> }>;
  flight: {
    durationMs: number;
    irisAtMs: number;
    skipMs: number;
    landingMs: number;
    baseRadius: number;
    passScale: number;
    rest: number;
    tierLag: number;
    tierStaggerMs: number;
    landingDepth: number;
    landingLag: number;
    gateFadeIn: number;
    irisInset: number;
    irisOpenMs: number;
    coronaMs: number;
    corona: Array<[number, string]>;
    tierFadeMs: number;
    travel: number;
    samples: { camera: number[]; iris: number[]; gates: number[][]; gateAlpha: number[][]; tiers: number[][] };
    landingFrom: number[];
  };
  dial: { segments: number; gapTurn: number; cometTurn: number; cometSeconds: number; sealMs: number };
  seal: {
    stages: string[];
    progress: Record<'idle' | 'ready' | 'signed' | 'sent' | 'accepted' | 'complete', number>;
    stageMs: number;
    igniteMs: number;
    restMs: number;
    restStrength: number;
    breakMs: number;
    cometSeconds: number;
    strokes: Record<SealStage, Array<[string, number]>>;
    stars: Record<'signed' | 'sent' | 'accepted', number>;
  };
  loader: { comets: number; tailTurn: number; secondsPerTurn: number; restAlpha: number };
  asanoha: { width: number; height: number; lines: Array<[number, number, number, number]> };
}

export type SealStage = 'ready' | 'signed' | 'sent' | 'accepted';

export const SHIKIBAN = tokens as unknown as ShikibanTokens;
export const { flight: FLIGHT, mirror: MIRROR, dial: DIAL, seal: SEAL, loader: LOADER, colors: SHIKIBAN_COLORS } = SHIKIBAN;
export const PERSPECTIVE = SHIKIBAN.depth.perspective;
/** The ladder of durations: 90, 128, 180, 255, 360, 510, 720, 1020 ms. */
export const LADDER_MS = SHIKIBAN.durationsMs;

const TAU = Math.PI * 2;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Rule 2: the scale of a plane at depth z (points, positive is away from the viewer). */
export const depthScale = (z: number, p = PERSPECTIVE): number => p / (p + z);

export const smootherstep = (x: number): number => {
  const k = clamp01(x);
  return k * k * k * (k * (6 * k - 15) + 10);
};

/** A cubic bezier easing as CSS: the kit's control points. */
export const cssEasing = (name: keyof ShikibanTokens['easing']): string => `cubic-bezier(${SHIKIBAN.easing[name].join(', ')})`;

/** The same curve as a function of time 0-1, for values a canvas draws. */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number]): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      const value = sx(t);
      if (Math.abs(value - x) < 1e-6) break;
      if (value < x) low = t;
      else high = t;
      t = (low + high) / 2;
    }
    return sy(t);
  };
}

export const settle = bezier(SHIKIBAN.easing.settle);

// --- The launch flight ----------------------------------------------------------------------------------------------

/** Camera position (points) at flight progress u: slow out of the dive, fast through the gates, a soft landing. */
export const cameraAt = (u: number): number => FLIGHT.travel * smootherstep(u);

/** Scale of gate i at flight progress u, or 0 once it has swept past the viewer. */
export function gateScale(i: number, u: number): number {
  const distance = PERSPECTIVE + SHIKIBAN.gates[i].depth - cameraAt(u);
  return distance <= PERSPECTIVE / FLIGHT.passScale ? 0 : PERSPECTIVE / distance;
}

/** How strongly gate i shows: far gates sit in haze, and a gate fades as it sweeps past. */
export function gateAlpha(i: number, u: number): number {
  const scale = gateScale(i, u);
  if (!scale) return 0;
  const haze = clamp01((scale - 0.1) / 0.5);
  const pass = clamp01((FLIGHT.passScale - scale) / (FLIGHT.passScale * 0.7));
  return (0.25 + 0.75 * haze) * pass;
}

/** The mirror gate's scale without the pass cut-off: the opening keeps growing until it has cleared the view. */
export function irisScale(u: number): number {
  const distance = PERSPECTIVE + SHIKIBAN.gates[SHIKIBAN.gates.length - 1].depth - cameraAt(u);
  return PERSPECTIVE / Math.max(distance, PERSPECTIVE / 400);
}

/** The opening's radius in pixels at `flightMs` into the flight, for a view whose shorter side is `side`. */
export function irisRadius(flightMs: number, side: number): number {
  const open = clamp01((flightMs - FLIGHT.irisAtMs) / FLIGHT.irisOpenMs);
  if (open <= 0) return 0;
  const u = clamp01(flightMs / FLIGHT.durationMs);
  return FLIGHT.baseRadius * side * irisScale(u) * MIRROR.cusp * FLIGHT.irisInset * (1 - (1 - open) ** 3);
}

/** Scale of wallet tier k (0 is nearest) at flight progress u. Every tier ends at exactly 1. */
export function tierScale(k: number, u: number): number {
  const remaining = FLIGHT.travel - cameraAt(u);
  return depthScale(remaining * (1 + k * FLIGHT.tierLag));
}

/** Tier k's scale at the start of the short arrival; it eases to 1 with `settle`. */
export const landingFrom = (k: number): number => depthScale(FLIGHT.landingDepth * (1 + k * FLIGHT.landingLag));

/** The deepest tier the kit samples; anything marked deeper flies with it. */
export const MAX_TIER = FLIGHT.samples.tiers.length - 1;

// --- The mirror -----------------------------------------------------------------------------------------------------

/** A point on the mirror's rim at `turn` (0-1 clockwise from 12 o'clock), outer radius 1, y down. */
export function rimPoint(turn: number): [number, number] {
  const t = ((turn % 1) + 1) % 1;
  const shifted = (t + 1 / 16) % 1;
  const lobe = Math.floor(shifted * MIRROR.lobes);
  const within = shifted * MIRROR.lobes - lobe;
  const out = -Math.PI / 2 + (lobe / MIRROR.lobes) * TAU;
  const cx = Math.cos(out) * MIRROR.lobeCentre;
  const cy = Math.sin(out) * MIRROR.lobeCentre;
  const angle = out - Math.PI / 4 + within * (Math.PI / 2);
  return [cx + Math.cos(angle) * MIRROR.lobeRadius, cy + Math.sin(angle) * MIRROR.lobeRadius];
}

/** The rim as SVG path data in a viewBox of -1 -1 2 2. */
export function rimPathData(): string {
  const f = (value: number) => Number(value.toFixed(4));
  return (
    MIRROR.rim
      .map((arc, index) => {
        const x0 = arc.cx + Math.cos(arc.from) * arc.r;
        const y0 = arc.cy + Math.sin(arc.from) * arc.r;
        const x1 = arc.cx + Math.cos(arc.to) * arc.r;
        const y1 = arc.cy + Math.sin(arc.to) * arc.r;
        return `${index ? 'L' : 'M'}${f(x0)} ${f(y0)}A${f(arc.r)} ${f(arc.r)} 0 0 1 ${f(x1)} ${f(y1)}`;
      })
      .join('') + 'Z'
  );
}

// --- The sync dial --------------------------------------------------------------------------------------------------

export interface DialInput {
  /** Networks that have answered. */
  done?: number;
  /** Networks that gave up. */
  failed?: number;
  /** Networks the wallet reads balances from; 0 or absent when unknown. */
  total?: number;
}

export interface DialState {
  state: 'idle' | 'syncing' | 'live' | 'partial';
  /** Gold: [fromTurn, toTurn] clockwise from 12 o'clock. */
  lit: [number, number];
  /** Ember, at the end of the ring. */
  failed: [number, number];
  fraction: number;
}

const r5 = (value: number): number => Math.round(value * 1e5) / 1e5;

/** What the dial shows: the share that has answered, and at the end of the ring the share that gave up. */
export function dialState({ done = 0, failed = 0, total = 0 }: DialInput = {}): DialState {
  if (!(total > 0)) return { state: 'idle', lit: [0, 0], failed: [1, 1], fraction: 0 };
  const answered = Math.min(total, Math.max(0, done));
  const gaveUp = Math.min(total - answered, Math.max(0, failed));
  const settled = answered + gaveUp >= total;
  return {
    state: settled ? (gaveUp ? 'partial' : 'live') : 'syncing',
    lit: [0, r5(answered / total)],
    failed: [r5(1 - gaveUp / total), 1],
    fraction: r5(answered / total),
  };
}

/** The part of segment s covered by the arc [from, to], or null. The gaps between segments stay dark. */
export function dialSegment(s: number, [from, to]: readonly [number, number]): [number, number] | null {
  const start = s / DIAL.segments + DIAL.gapTurn / 2;
  const end = (s + 1) / DIAL.segments - DIAL.gapTurn / 2;
  const low = Math.max(start, from);
  const high = Math.min(end, to);
  return high - low > 1e-6 ? [r5(low), r5(high)] : null;
}

// --- The loader -----------------------------------------------------------------------------------------------------

/** Where the loader's three comets are at `seconds`: [headTurn, tailTurn] each, on the mirror's rim. */
export function loaderComets(seconds: number): Array<[number, number]> {
  const head = (seconds / LOADER.secondsPerTurn) % 1;
  return Array.from({ length: LOADER.comets }, (_, index) => {
    const at = (head + index / LOADER.comets) % 1;
    return [r5(at), r5(at - LOADER.tailTurn)];
  });
}

// --- The seal -------------------------------------------------------------------------------------------------------

export const SEAL_STAGES: readonly SealStage[] = ['ready', 'signed', 'sent', 'accepted'];

/** The stage reached as a number: 0 nothing, 1 ready, 2 signed, 3 sent, 4 accepted. */
export const sealStageNumber = (stage: SealStage | 'idle'): number => (stage === 'idle' ? 0 : SEAL_STAGES.indexOf(stage) + 1);
