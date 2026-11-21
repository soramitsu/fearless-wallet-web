// Canvas drawing for the shikiban figures that move too fast, or carry too many strokes, for markup: the launch
// flight's gates and corona, and the seal. It follows the kit's reference (tools/shikiban-draw.mjs).
import { FLIGHT, MIRROR, SEAL, SHIKIBAN, SHIKIBAN_COLORS, gateAlpha, gateScale } from '@/feel/shikiban';
import { SOLAR, strokeProgress, type SolarStroke } from '@/feel/solarGeometry';

const TAU = Math.PI * 2;
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Strokes the current path twice: a wide soft glow, then the bright core. Additive, so crossings brighten. */
function glowStroke(ctx: CanvasRenderingContext2D, width: number, alpha: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SHIKIBAN_COLORS.glow;
  ctx.globalAlpha = 0.3 * alpha;
  ctx.lineWidth = width * 5;
  ctx.stroke();
  ctx.strokeStyle = SHIKIBAN_COLORS.core;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.restore();
}

function drawGate(
  ctx: CanvasRenderingContext2D,
  gate: (typeof SHIKIBAN.gates)[number],
  { cx, cy, r, alpha, scale }: { cx: number; cy: number; r: number; alpha: number; scale: number }
): void {
  if (alpha <= 0 || r <= 0) return;
  const width = Math.min(4.5, 1 + 0.9 * scale);

  if (gate.figure === 'mirror') {
    ctx.beginPath();
    MIRROR.rim.forEach((arc) => ctx.arc(cx + arc.cx * r, cy + arc.cy * r, arc.r * r, arc.from, arc.to));
    ctx.closePath();
    glowStroke(ctx, width * 1.25, alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, r * MIRROR.cusp * FLIGHT.irisInset, 0, TAU);
    glowStroke(ctx, width * 0.7, alpha * 0.8);
    return;
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  glowStroke(ctx, width, alpha);
  const square = gate.square ?? [];
  ctx.beginPath();
  square.forEach(([x, y], index) => (index ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r)));
  ctx.closePath();
  glowStroke(ctx, width * 0.75, alpha * 0.85);
  // The four corners where earth touches heaven.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = SHIKIBAN_COLORS.star;
  ctx.globalAlpha = alpha;
  for (const [x, y] of square) {
    ctx.beginPath();
    ctx.arc(cx + x * r, cy + y * r, width * 1.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export interface FlightFrame {
  /** Milliseconds into the flight. */
  flightMs: number;
  /** The dive's focus, in canvas units. */
  cx: number;
  cy: number;
  /** The view's shorter side. */
  side: number;
  width: number;
  height: number;
  /** The opening's radius now (irisRadius). */
  iris: number;
}

/**
 * One frame of the launch flight: the corona about the opening, then the gates over it. The canvas is cleared first.
 * The opening itself is cut by the overlay's mask, not here.
 */
export function drawFlight(ctx: CanvasRenderingContext2D, { flightMs, cx, cy, side, width, height, iris }: FlightFrame): void {
  const u = clamp01(flightMs / FLIGHT.durationMs);
  ctx.clearRect(0, 0, width, height);

  // The corona: once the mirror opens, the light gathers round its rim and the rest of the view falls to ink.
  const corona = clamp01((flightMs - FLIGHT.irisAtMs) / FLIGHT.coronaMs);
  if (corona > 0) {
    const gradient = ctx.createRadialGradient(cx, cy, iris, cx, cy, Math.max(iris * 2.4, iris + side * 0.5));
    for (const [stop, colour] of FLIGHT.corona) gradient.addColorStop(stop, colour);
    ctx.save();
    ctx.globalAlpha = corona;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  const fade = clamp01(u / FLIGHT.gateFadeIn);
  // Far gates first, so a near gate's glow lies over them.
  for (let i = SHIKIBAN.gates.length - 1; i >= 0; i--) {
    const scale = gateScale(i, u);
    if (!scale) continue;
    drawGate(ctx, SHIKIBAN.gates[i], { cx, cy, r: FLIGHT.baseRadius * side * scale, alpha: gateAlpha(i, u) * fade, scale });
  }
}

// --- The seal -------------------------------------------------------------------------------------------------------

export interface SealFrame {
  cx: number;
  cy: number;
  r: number;
  /** The stage reached, eased: 1 ready (both rings), 2 signed, 3 sent, 4 accepted (the upward triangle's sides). */
  q: number;
  /** The ignite's progress for every other stroke, once q is 4. */
  p?: number;
  /** Drives the cyan comet on the stroke the transfer is waiting for. */
  seconds?: number;
  /** False once nothing is in flight (accepted, failed, or reduced motion). */
  waiting?: boolean;
  /** 0-1: the figure turns ember and falls apart. */
  broken?: number;
  strength?: number;
  /** The tick ring's rotation in radians. */
  turn?: number;
}

const cubicOut = (t: number): number => 1 - (1 - t) ** 3;
const rings = SOLAR.strokes.filter((item) => item.group === 'ring');
const hexagram = SOLAR.strokes.filter((item) => item.group === 'hexagram');
const sides = SEAL.strokes.signed.concat(SEAL.strokes.sent, SEAL.strokes.accepted).map(([, index]) => hexagram[index]);
// The star that lands on a corner of the triangle when the side that ends there closes.
const cornerStage = new Map<number, number>([
  [SEAL.stars.signed, 2],
  [SEAL.stars.sent, 3],
  [SEAL.stars.accepted, 4],
]);

/** How much of a stroke the seal has drawn. */
export function sealStrokeAmount(item: SolarStroke, q: number, p: number): number {
  if (item.group === 'ring') return clamp01(q);
  const side = sides.indexOf(item);
  if (side >= 0) return clamp01(q - 1 - side);
  return q >= 4 ? strokeProgress(item.reveal, p) : 0;
}

/** The seal: the solar geometry drawn by a transfer's stages (SPEC v4 part 3). */
export function drawSeal(
  ctx: CanvasRenderingContext2D,
  { cx, cy, r, q, p = SEAL.progress.accepted, seconds = 0, waiting = true, broken = 0, strength = 1, turn = 0 }: SealFrame
): void {
  const { stroke, colors, strokes, ticks, stars } = SOLAR;
  const pointOn = (item: SolarStroke, k: number): [number, number] =>
    item.type === 'line'
      ? [cx + (item.x1 + (item.x2 - item.x1) * k) * r, cy + (item.y1 + (item.y2 - item.y1) * k) * r]
      : [cx + (item.cx + Math.cos(-Math.PI / 2 - k * TAU) * item.r) * r, cy + (item.cy + Math.sin(-Math.PI / 2 - k * TAU) * item.r) * r];

  ctx.save();
  ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  const fall = broken * broken * r * 0.2;
  for (const pass of ['glow', 'core'] as const) {
    ctx.strokeStyle = broken ? SHIKIBAN_COLORS.failure : colors[pass];
    ctx.globalAlpha = (pass === 'glow' ? 0.35 : 1) * strength * (1 - broken * 0.9);
    strokes.forEach((item, index) => {
      const k = sealStrokeAmount(item, q, p);
      if (k <= 0) return;
      const drop = broken ? fall * (0.4 + ((index * 37) % 10) / 10) : 0;
      ctx.lineWidth = Math.max(0.6, stroke[pass] * item.weight * r * (pass === 'glow' ? 0.5 : 1.6));
      ctx.beginPath();
      if (item.type === 'line') {
        const [ex, ey] = pointOn(item, k);
        ctx.moveTo(cx + item.x1 * r, cy + item.y1 * r + drop);
        ctx.lineTo(ex, ey + drop);
      } else {
        ctx.arc(cx + item.cx * r, cy + item.cy * r + drop, item.r * r, -Math.PI / 2, -Math.PI / 2 - k * TAU, true);
      }
      ctx.stroke();
    });
  }

  if (!broken) {
    // The heaven plate turns from the moment the transfer is ready.
    const plate = clamp01(q) * 0.9 * strength;
    if (plate > 0) {
      ctx.fillStyle = colors.core;
      ctx.globalAlpha = plate;
      for (let i = 0; i < ticks.count; i++) {
        const angle = turn + (i / ticks.count) * TAU;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(angle) * ticks.r * r, cy + Math.sin(angle) * ticks.r * r, Math.max(0.6, ticks.size * r), 0, TAU);
        ctx.fill();
      }
    }

    stars.forEach((star, index) => {
      const stage = cornerStage.get(index);
      const k =
        stage !== undefined ? clamp01((q - stage + 0.25) / 0.25) : q >= 4 ? strokeProgress([star.reveal - 0.04, star.reveal + 0.03], p) : 0;
      if (k <= 0) return;
      const size = star.size * r * 0.5 * (0.6 + 0.4 * k);
      const x = cx + star.x * r;
      const y = cy + star.y * r;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, colors.star);
      gradient.addColorStop(0.25, colors.core);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = k * strength;
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
    });

    // In flight: a cyan comet runs the stroke the transfer is waiting for, over a faint trace of it.
    const settled = Math.floor(q + 1e-6);
    if (waiting && q < 4 && q - settled < 0.02) {
      const item = settled === 0 ? rings[0] : sides[settled - 1];
      ctx.strokeStyle = SHIKIBAN_COLORS.flight;
      ctx.globalAlpha = 0.22 * strength;
      ctx.lineWidth = Math.max(0.6, stroke.core * item.weight * r * 1.2);
      ctx.setLineDash([r * 0.02, r * 0.045]);
      ctx.beginPath();
      if (item.type === 'line') {
        ctx.moveTo(cx + item.x1 * r, cy + item.y1 * r);
        ctx.lineTo(cx + item.x2 * r, cy + item.y2 * r);
      } else {
        ctx.arc(cx + item.cx * r, cy + item.cy * r, item.r * r, 0, TAU);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const head = cubicOut((seconds / SEAL.cometSeconds) % 1);
      for (let i = 0; i < 9; i++) {
        const k = head - i * 0.022;
        if (k < 0) break;
        const [x, y] = pointOn(item, k);
        const size = r * 0.075 * (1 - i / 11);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
        gradient.addColorStop(0, i ? SHIKIBAN_COLORS.flight : '#FFFFFF');
        gradient.addColorStop(0.35, SHIKIBAN_COLORS.flight);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (1 - i / 9) * strength;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}
