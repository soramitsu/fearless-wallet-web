import wingsSvg from '@/assets/brand/portfolio-sun/wings.svg?raw';
import { RAY_COUNT, type AllocationGroup } from '@/portfolio/dashboard/allocation';
import {
  POPUP_SKY,
  WING_FADE,
  WING_OUT,
  chartColour,
  layoutRays,
  logoPlacement,
  rayAngle,
  rayIndexAt,
  rayLine,
  skyReach,
  skyStars,
  wingPaths,
  wingReach,
  wingStretch,
  wingsLayer,
  wingsVeil,
} from '@/portfolio/dashboard/skyGeometry';

const group = (key: string, rays: number, slot: number): AllocationGroup => ({ key, name: key, value: rays, share: rays, rays, slot });

describe('sky rays', () => {
  it('fan out symmetrically across the span, centred above the disc', () => {
    expect(rayAngle(0) + rayAngle(RAY_COUNT - 1)).toBeCloseTo(0, 10);
    expect(rayAngle(RAY_COUNT - 1) - rayAngle(0)).toBeCloseTo((((POPUP_SKY.span * (RAY_COUNT - 1)) / RAY_COUNT) * Math.PI) / 180, 10);
  });

  it('run outward from the inner to the outer radius, above the disc centre', () => {
    for (const index of [0, 24, 49, 50, 75, 99]) {
      const { x1, y1, x2, y2 } = rayLine(index);

      expect(Math.hypot(x1 - POPUP_SKY.cx, y1 - POPUP_SKY.cy)).toBeCloseTo(POPUP_SKY.r0, 1);
      expect(Math.hypot(x2 - POPUP_SKY.cx, y2 - POPUP_SKY.cy)).toBeCloseTo(POPUP_SKY.r1, 1);
      expect(y2).toBeLessThan(POPUP_SKY.cy);
    }
  });

  it('move a lifted ray along its own direction, a unit step', () => {
    const { dx, dy } = rayLine(10);

    expect(Math.hypot(dx, dy)).toBeCloseTo(1, 1);
    expect(dy).toBeLessThan(0);
  });
});

describe('sky hit test', () => {
  it('finds the ray under a point on that ray, for every ray', () => {
    for (let index = 0; index < RAY_COUNT; index += 1) {
      const angle = rayAngle(index);
      const radius = (POPUP_SKY.r0 + POPUP_SKY.r1) / 2;

      expect(rayIndexAt(POPUP_SKY.cx + Math.sin(angle) * radius, POPUP_SKY.cy - Math.cos(angle) * radius)).toBe(index);
    }
  });

  it('finds nothing on the disc, far outside the fan, or below the horizon', () => {
    expect(rayIndexAt(POPUP_SKY.cx, POPUP_SKY.cy)).toBeNull();
    expect(rayIndexAt(POPUP_SKY.cx, POPUP_SKY.cy - POPUP_SKY.r1 - 40)).toBeNull();
    expect(rayIndexAt(POPUP_SKY.cx + 40, POPUP_SKY.cy + 30)).toBeNull();
  });

  it('finds nothing beyond the ends of the span', () => {
    // Straight to the right of the disc is 90 degrees, outside the 168 degree fan.
    expect(rayIndexAt(POPUP_SKY.cx + 50, POPUP_SKY.cy)).toBeNull();
  });
});

describe('logo placement', () => {
  it('puts the disc centre of the master on the sky disc centre', () => {
    const { left, top, width, height } = logoPlacement();

    expect(left + (width * 501) / 1002).toBeCloseTo(POPUP_SKY.cx, 1);
    expect(top + (height * 107) / 206).toBeCloseTo(POPUP_SKY.cy, 1);
    expect(width / height).toBeCloseTo(1002 / 206, 1);
  });
});

describe('wings', () => {
  const xs = (d: string): number[] =>
    Array.from(d.matchAll(/([MLHV])([^MLHVZ]+)/g)).flatMap(([, command, args]) => {
      const values = args.trim().split(/ +/).map(Number);

      if (command === 'V') return [];

      return command === 'H' ? values : values.filter((_, index) => index % 2 === 0);
    });
  const paths = wingPaths(wingsSvg);
  const master = paths.flatMap(({ d }) => xs(d));
  const scale = POPUP_SKY.logoW / 1002;

  it('read the nine wing paths of the approved layer, which draw with moves and lines only', () => {
    expect(paths).toHaveLength(9);
    expect(Math.min(...master)).toBeCloseTo(9.9, 1);
    expect(Math.max(...master)).toBeCloseTo(992.1, 1);
    expect(() => wingPaths('<path d="M0 0C1 1 2 2 3 3Z" fill="#000"/>')).toThrow();
  });

  it('stay the master while its own tip runs off the edge', () => {
    const stretch = wingStretch(441);

    [0, 160, 300, 491.1].forEach((distance) => expect(stretch(distance)).toBe(distance));
  });

  it('stretch only past the shoulder, smoothly, until the tip runs off the edge', () => {
    const stretch = wingStretch(1226);
    const step = (distance: number) => stretch(distance + 0.5) - stretch(distance - 0.5);

    [0, 100, 151, 160].forEach((distance) => expect(stretch(distance)).toBe(distance));
    for (let distance = 160; distance < 491; distance += 1) expect(stretch(distance + 1)).toBeGreaterThan(stretch(distance));
    // No bend where the stretch starts or where it stops easing in.
    expect(step(160.5)).toBeCloseTo(1, 1);
    expect(step(160 + 0.35 * 331.1)).toBeCloseTo(step(160 + 0.35 * 331.1 + 1), 2);
    // The edge cuts the stretched wing at 85% of its length past the shoulder.
    expect(stretch(491.1)).toBeCloseTo(160 + (1226 - 160) / 0.85, 6);
  });

  it('fill the sky alone and draw the master there until the card is measured', () => {
    const layer = wingsLayer(paths, skyReach());

    expect([layer.left, layer.width]).toEqual([0, POPUP_SKY.w]);
    expect(layer.top).toBe(logoPlacement().top);
    expect(layer.paths.map(({ fill }) => fill)).toEqual(paths.map(({ fill }) => fill));
    layer.paths.flatMap(({ d }) => xs(d)).forEach((x, index) => expect(x).toBeCloseTo(master[index], 1));
  });

  it('run from one card edge to the other, each tip past its own edge', () => {
    const reach = { left: 389, right: 131 };
    const layer = wingsLayer(paths, reach);
    const [viewLeft, , viewWidth] = layer.viewBox.split(' ').map(Number);
    const drawn = layer.paths.flatMap(({ d }) => xs(d));

    expect([layer.left, layer.width]).toEqual([POPUP_SKY.cx - 389, 389 + 131]);
    expect(viewLeft).toBeCloseTo(501 - 389 / scale, 1);
    expect(viewWidth).toBeCloseTo((389 + 131) / scale, 1);
    // Both tips run off: past the left edge, and the right one as drawn in the master.
    expect(Math.min(...drawn)).toBeLessThan(viewLeft);
    expect(Math.max(...drawn)).toBeCloseTo(992.1, 1);
    expect(Math.max(...drawn)).toBeGreaterThan(viewLeft + viewWidth);
    // The sun's side of each wing is the master.
    drawn.forEach((x, index) => {
      if (Math.abs(master[index] - 501) <= 160) expect(x).toBeCloseTo(master[index], 1);
    });
  });

  it('run past each edge by the bleed asked for, so the cursor parallax never shows a tip', () => {
    const reach = { left: 389, right: 140 };
    const plain = wingsLayer(paths, reach).paths.flatMap(({ d }) => xs(d));
    const bled = wingsLayer(paths, reach, POPUP_SKY, 24);
    const drawn = bled.paths.flatMap(({ d }) => xs(d));
    const [viewLeft, , viewWidth] = bled.viewBox.split(' ').map(Number);

    // The box and the slice it shows do not change; the tips run further out.
    expect([bled.left, bled.width, bled.viewBox]).toEqual([POPUP_SKY.cx - 389, 529, wingsLayer(paths, reach).viewBox]);
    expect((viewLeft - Math.min(...drawn)) * scale).toBeGreaterThan(24);
    expect((Math.max(...drawn) - viewLeft - viewWidth) * scale).toBeGreaterThan(24);
    expect(Math.min(...drawn)).toBeLessThan(Math.min(...plain));
  });

  it('are veiled only inside the card beside the sky, fading in only inside the sky', () => {
    const veil = 'rgb(0 0 0 / var(--sky-veil, 1))';

    // Popup: the sky at the card's right edge, the text to its left. Out of the card the left wing is drawn in full.
    const popup = { left: 407, right: 148, card: { left: 390, right: 131 }, fade: { left: false, right: false } };
    expect(wingsVeil({ left: POPUP_SKY.cx - 407, width: 555 }, popup)).toBe(
      `linear-gradient(to right, #000 0, #000 17px, ${veil} 17px, ${veil} 276px, #000 336px, #000 100%)`
    );
    // Stacked: the sun centred, the card a little wider than the sky on each side.
    const stacked = { left: 180, right: 174, card: { left: 163, right: 161 }, fade: { left: false, right: false } };
    expect(wingsVeil({ left: POPUP_SKY.cx - 180, width: 354 }, stacked)).toBe(
      `linear-gradient(to right, #000 0, #000 17px, ${veil} 17px, ${veil} 49px, #000 109px, #000 251px, ${veil} 311px, ${veil} 341px, #000 341px, #000 100%)`
    );
    // Before the card is measured the wings stay in the sky, and nothing is veiled.
    expect(wingsVeil({ left: 0, width: POPUP_SKY.w }, skyReach())).toBe('linear-gradient(to right, #000 0, #000 100%)');
  });

  it('fade out toward an edge they stop short of', () => {
    const veil = 'rgb(0 0 0 / var(--sky-veil, 1))';
    // A full tab: the card in the middle of a wide window, the sky at the card's right edge.
    const reach = { left: 510, right: 251, card: { left: 390, right: 131 }, fade: { left: true, right: true } };

    expect(wingsVeil({ left: POPUP_SKY.cx - 510, width: 761 }, reach)).toBe(
      `linear-gradient(to right, transparent 0, #000 ${WING_FADE}px, #000 120px, ${veil} 120px, ${veil} 379px, #000 439px, #000 ${761 - WING_FADE}px, transparent 100%)`
    );
  });

  it('run out of the card to the window edge, or end and fade out well past the card', () => {
    // Popup (sky px from the sky's left): the window is 16 px past the card on each side.
    expect(wingReach(131, { left: -259, right: 262 }, { left: -276, right: 279 })).toEqual({
      left: 407,
      right: 148,
      card: { left: 390, right: 131 },
      fade: { left: false, right: false },
    });
    // A full tab: the window is far past the card, so each wing ends WING_OUT past it and fades out there.
    expect(wingReach(131, { left: -259, right: 262 }, { left: -636, right: 638 })).toEqual({
      left: 131 + 259 + WING_OUT,
      right: 262 + WING_OUT - 131,
      card: { left: 390, right: 131 },
      fade: { left: true, right: true },
    });
    // A window edge exactly WING_OUT past the card is still run off, not faded.
    expect(wingReach(131, { left: -259, right: 262 }, { left: -259 - WING_OUT, right: 262 + WING_OUT }).fade).toEqual({ left: false, right: false });
  });
});

describe('layoutRays', () => {
  it('paints each group in order, left to right, and leaves the rest empty', () => {
    const rays = layoutRays([group('a', 60, 1), group('b', 30, 2)]);

    expect(rays).toHaveLength(RAY_COUNT);
    expect(rays.slice(0, 60).every((ray) => ray?.key === 'a' && ray.slot === 1)).toBe(true);
    expect(rays.slice(60, 90).every((ray) => ray?.key === 'b')).toBe(true);
    expect(rays.slice(90).every((ray) => ray === null)).toBe(true);
  });

  it('never paints more than the rays there are', () => {
    expect(layoutRays([group('a', 80, 1), group('b', 80, 2)]).filter(Boolean)).toHaveLength(RAY_COUNT);
    expect(layoutRays([])).toEqual(Array.from({ length: RAY_COUNT }, () => null));
  });
});

describe('chartColour', () => {
  it('maps slots one to five to their token and everything else to Other', () => {
    expect([1, 2, 3, 4, 5].map(chartColour)).toEqual(['var(--fw-chart-1)', 'var(--fw-chart-2)', 'var(--fw-chart-3)', 'var(--fw-chart-4)', 'var(--fw-chart-5)']);
    expect([0, 6, -1, 2.5, Number.NaN].map(chartColour)).toEqual(Array.from({ length: 5 }, () => 'var(--fw-chart-other)'));
  });
});

describe('skyStars', () => {
  it('are the same on every render and stay in the upper sky', () => {
    expect(skyStars()).toEqual(skyStars());
    skyStars().forEach(({ x, y }) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(POPUP_SKY.w);
      expect(y).toBeLessThanOrEqual(POPUP_SKY.h * 0.82);
    });
  });
});
