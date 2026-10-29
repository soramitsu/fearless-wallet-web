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
 * The wings run out of the hero card and off the edges of the window, as they run off the screen on phones (design spec
 * 3.1). The disc sets the master's size, so its wingspan alone stops short of the window: past the shoulder each wing
 * stretches sideways just enough for its tip to run off its own edge. Distances are master units from the disc centre.
 * The cobras end at 151, so the sun, the cobras and the inner wing are always the master unchanged.
 */
const WING_SHOULDER = 160;
const WING_TIP = 491.1;
/** The edge cuts a stretched wing at 85% of its length past the shoulder: the tip runs off, the wing never ends. */
const WING_SHOWN = 0.85;
/** The stretch eases in over the first 35% of the wing past the shoulder, so no feather bends there. */
const WING_EASE = 0.35;

/** One wing: the distance a point of the master is drawn at, for an edge `reach` master units from the disc. */
export function wingStretch(reach: number): (distance: number) => number {
  const length = WING_TIP - WING_SHOULDER;
  const target = (reach - WING_SHOULDER) / WING_SHOWN;

  // The master's own tip already runs off this edge.
  if (target <= length) return (distance) => distance;

  const ease = WING_EASE * length;
  const factor = (target - ease / 2) / (length - ease / 2);

  return (distance) => {
    const past = distance - WING_SHOULDER;

    if (past <= 0) return distance;
    if (past <= ease) return distance + ((factor - 1) * past * past) / (2 * ease);

    return WING_SHOULDER + ease + ((factor - 1) * ease) / 2 + factor * (past - ease);
  };
}

export interface WingPath {
  d: string;
  fill: string;
}

/** The wings layer's paths. It draws with absolute moves and lines only, which a sideways stretch keeps exact. */
export function wingPaths(svg: string): WingPath[] {
  return Array.from(svg.matchAll(/<path d="([^"]+)" fill="([^"]+)"\/>/g), ([, d, fill]) => {
    if (/[^MLHVZ\d .]/.test(d)) throw new Error('The wings layer draws with M, L, H, V and Z only');

    return { d, fill };
  });
}

/** CSS px from the disc centre to where each wing ends: the edge it runs off, or where it has faded out. */
export interface WingReach {
  left: number;
  right: number;
  /** CSS px from the disc centre to the card's inner edges, once measured. */
  card?: { left: number; right: number };
  /** A wing that ends short of the window's edge fades out rather than being cut. */
  fade?: { left: boolean; right: boolean };
}

/** How far out of the card a wing reaches at most, in px: in a window wider than that, it fades out before the edge. */
export const WING_OUT = 120;
/** Over how many px a wing that ends short of the window's edge fades out. */
export const WING_FADE = 80;

/** The sky's own box: how far the wings reach until the window around it is measured. */
export const skyReach = (geometry: SkyGeometry = POPUP_SKY): WingReach => ({ left: geometry.cx, right: geometry.w - geometry.cx });

/**
 * Where the wings end, from the measured boxes (CSS px from the left of the page, or any one origin): the sky's disc
 * centre, the card's inner edges and the edges of the box that clips the sky, the window on the wallet screen. Each wing
 * runs out of the card to that edge, or, more than `WING_OUT` past the card, fades out there.
 */
export function wingReach(centre: number, card: { left: number; right: number }, stage: { left: number; right: number }): WingReach {
  const left = centre - Math.max(stage.left, card.left - WING_OUT);
  const right = Math.min(stage.right, card.right + WING_OUT) - centre;

  return {
    left,
    right,
    card: { left: centre - card.left, right: card.right - centre },
    fade: { left: card.left - WING_OUT > stage.left + 0.5, right: card.right + WING_OUT < stage.right - 0.5 },
  };
}

/**
 * The wings layer from one edge to the other (sky px), the slice of the master it shows, and its stretched paths. Each
 * tip runs `bleed` px further past its edge, so a wing moved by the cursor parallax never pulls its tip into view.
 */
export function wingsLayer(
  paths: readonly WingPath[],
  reach: WingReach,
  geometry: SkyGeometry = POPUP_SKY,
  bleed = 0
): { left: number; top: number; width: number; height: number; viewBox: string; paths: WingPath[] } {
  const scale = geometry.logoW / MASTER.w;
  const left = reach.left / scale;
  const right = reach.right / scale;
  const stretchLeft = wingStretch(left + bleed / scale);
  const stretchRight = wingStretch(right + bleed / scale);
  const x = (value: number): number =>
    round(value < MASTER.discX ? MASTER.discX - stretchLeft(MASTER.discX - value) : MASTER.discX + stretchRight(value - MASTER.discX));
  const stretch = (d: string): string =>
    d.replace(/([MLHV])([^MLHVZ]+)/g, (_, command: string, args: string) => {
      const values = args.trim().split(/ +/).map(Number);

      if (command === 'V') return command + args;

      return command + values.map((value, index) => (command === 'H' || index % 2 === 0 ? x(value) : value)).join(' ');
    });
  const { top, height } = logoPlacement(geometry);

  return {
    left: geometry.cx - reach.left,
    top,
    width: reach.left + reach.right,
    height,
    viewBox: `${round(MASTER.discX - left)} 0 ${round(left + right)} ${MASTER.h}`,
    paths: paths.map(({ d, fill }) => ({ d: stretch(d), fill })),
  };
}

/** How far inside the sky the veil fades out, in px. Beside the sky, where the hero text runs, a wing is fully veiled. */
const VEIL_FADE = 60;

/**
 * The wings layer's mask. Inside the card, beside the sky, a wing may run behind text, so the host veils it there with
 * `--sky-veil`, an opacity (unset, nothing is veiled); out of the card it is drawn in full again, and a wing that ends
 * short of the window's edge fades out. Until the card is measured, everything beside the sky is veiled.
 */
export function wingsVeil(layer: { left: number; width: number }, reach: WingReach, geometry: SkyGeometry = POPUP_SKY): string {
  const veil = 'rgb(0 0 0 / var(--sky-veil, 1))';
  const px = (value: number): string => `${round(value)}px`;
  const skyStart = -layer.left;
  const skyEnd = skyStart + geometry.w;
  const cardStart = reach.card ? reach.left - reach.card.left : 0;
  const cardEnd = reach.card ? reach.left + reach.card.right : layer.width;
  const stops = [
    ...(reach.fade?.left ? ['transparent 0', `#000 ${WING_FADE}px`] : ['#000 0']),
    ...(skyStart - cardStart > 1 ? [`#000 ${px(cardStart)}`, `${veil} ${px(cardStart)}`, `${veil} ${px(skyStart)}`, `#000 ${px(skyStart + VEIL_FADE)}`] : []),
    ...(cardEnd - skyEnd > 1 ? [`#000 ${px(skyEnd - VEIL_FADE)}`, `${veil} ${px(skyEnd)}`, `${veil} ${px(cardEnd)}`, `#000 ${px(cardEnd)}`] : []),
    ...(reach.fade?.right ? [`#000 ${px(layer.width - WING_FADE)}`, 'transparent 100%'] : ['#000 100%']),
  ];

  return `linear-gradient(to right, ${stops.join(', ')})`;
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
