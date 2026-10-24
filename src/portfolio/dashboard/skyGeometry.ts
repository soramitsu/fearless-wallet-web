import { CHART_SLOT_COUNT, RAY_COUNT, type AllocationGroup } from '@/portfolio/dashboard/allocation';

/**
 * The sky's geometry in CSS px (design spec 6.1, Chrome popup). `cx`, `cy` is the sun disc's centre; rays run from
 * `r0` to `r1` across `span` degrees above it. The winged sun is placed so the disc centre of the master artwork
 * (501, 107 in a 1002 x 206 box) sits on (`cx`, `cy`).
 */
export interface SkyGeometry {
  w: number;
  h: number;
  logoW: number;
  cx: number;
  cy: number;
  r0: number;
  r1: number;
  span: number;
}

// The design's popup sky is 196 high; the popup is only 600, so the empty sky above the fan is trimmed by 20.
export const POPUP_SKY: SkyGeometry = { w: 262, h: 176, logoW: 318, cx: 131, cy: 106, r0: 30, r1: 68, span: 168 };

/** The master's own box and the disc centre in it. */
export const MASTER = { w: 1002, h: 206, discX: 501, discY: 107 } as const;

/** Degrees to radians, 0 straight up and negative to the left. */
export function rayAngle(index: number, geometry: SkyGeometry = POPUP_SKY, count: number = RAY_COUNT): number {
  return ((-geometry.span / 2 + ((index + 0.5) * geometry.span) / count) * Math.PI) / 180;
}

export interface RayLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The direction a lifted ray moves in, unit length. */
  dx: number;
  dy: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

export function rayLine(index: number, geometry: SkyGeometry = POPUP_SKY): RayLine {
  const angle = rayAngle(index, geometry);
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  return {
    x1: round(geometry.cx + sin * geometry.r0),
    y1: round(geometry.cy - cos * geometry.r0),
    x2: round(geometry.cx + sin * geometry.r1),
    y2: round(geometry.cy - cos * geometry.r1),
    dx: round(sin),
    dy: round(-cos),
  };
}

/** Where the winged sun sits so its disc lands on the sky's disc centre. */
export function logoPlacement(geometry: SkyGeometry = POPUP_SKY): { left: number; top: number; width: number; height: number } {
  const height = (geometry.logoW * MASTER.h) / MASTER.w;

  return {
    left: round(geometry.cx - (geometry.logoW * MASTER.discX) / MASTER.w),
    top: round(geometry.cy - (height * MASTER.discY) / MASTER.h),
    width: geometry.logoW,
    height: round(height),
  };
}

/**
 * The ray under a point (sky px), or null. The band is a little wider than the rays so a pointer does not have to
 * hit a hairline, and the area below the disc centre is never a ray. The legend chips are the keyboard twin.
 */
export function rayIndexAt(x: number, y: number, geometry: SkyGeometry = POPUP_SKY): number | null {
  const dx = x - geometry.cx;
  const dy = y - geometry.cy;
  const radius = Math.hypot(dx, dy);

  if (radius < geometry.r0 - 8 || radius > geometry.r1 + 18 || dy > 4) return null;

  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const index = Math.floor(((degrees + geometry.span / 2) / geometry.span) * RAY_COUNT);

  return index < 0 || index >= RAY_COUNT ? null : index;
}

export interface RayPaint {
  key: string;
  slot: number;
}

/** One entry per ray, left to right: the group that ray belongs to, or null for a ray with nothing behind it. */
export function layoutRays(groups: readonly AllocationGroup[]): Array<RayPaint | null> {
  const rays: Array<RayPaint | null> = Array.from({ length: RAY_COUNT }, () => null);
  let next = 0;

  groups.forEach(({ key, slot, rays: count }) => {
    for (let index = 0; index < count && next < RAY_COUNT; index += 1) {
      rays[next] = { key, slot };
      next += 1;
    }
  });

  return rays;
}

/** The CSS colour of a chart slot; 0 and anything out of range is Other. */
export const chartColour = (slot: number): string =>
  Number.isInteger(slot) && slot >= 1 && slot <= CHART_SLOT_COUNT ? `var(--fw-chart-${slot})` : 'var(--fw-chart-other)';

/** A deterministic scatter of small stars over the upper part of the sky: the night behind the sun. */
export function skyStars(geometry: SkyGeometry = POPUP_SKY, count = 16): Array<{ x: number; y: number; r: number; opacity: number }> {
  let seed = 11;
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  return Array.from({ length: count }, (_, index) => ({
    x: round(random() * geometry.w),
    y: round(random() * geometry.h * 0.82),
    r: index % 6 === 0 ? 1.3 : 0.8,
    opacity: round(0.22 + 0.34 * random()),
  }));
}
