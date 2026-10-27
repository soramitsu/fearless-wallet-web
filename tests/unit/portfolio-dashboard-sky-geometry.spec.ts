import wingsSvg from '@/assets/brand/portfolio-sun/wings.svg?raw';
import { RAY_COUNT, type AllocationGroup } from '@/portfolio/dashboard/allocation';
import {
  POPUP_SKY,
  chartColour,
  layoutRays,
  logoPlacement,
  rayAngle,
  rayIndexAt,
  rayLine,
  skyReach,
  skyStars,
  wingPaths,
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

  it('are veiled wherever they leave the sky, fading in only inside it', () => {
    const veil = 'rgb(0 0 0 / var(--sky-veil, 1))';

    // Popup: the sky at the card's right edge, the text to its left.
    expect(wingsVeil({ left: POPUP_SKY.cx - 389, width: 520 })).toBe(`linear-gradient(to right, ${veil} 258px, #000 318px, #000 100%)`);
    // Stacked: the sun centred, a wing past each side of the sky.
    expect(wingsVeil({ left: -49, width: 360 })).toBe(`linear-gradient(to right, ${veil} 49px, #000 109px, #000 251px, ${veil} 311px)`);
    // Before the card is measured the wings stay in the sky, and nothing is veiled.
    expect(wingsVeil({ left: 0, width: POPUP_SKY.w })).toBe('linear-gradient(to right, #000 0, #000 100%)');
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
