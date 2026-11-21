import { RAY_COUNT, type AllocationGroup } from '@/portfolio/dashboard/allocation';
import {
  POPUP_SKY,
  chartColour,
  crestPlacement,
  layoutRays,
  rayAngle,
  rayIndexAt,
  rayLine,
  skyStars,
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

describe('crest placement', () => {
  it('centres the sun-crow badge on the disc centre, its rim one pixel inside the rays', () => {
    const { left, top, size } = crestPlacement();

    expect(left + size / 2).toBe(POPUP_SKY.cx);
    expect(top + size / 2).toBe(POPUP_SKY.cy);
    expect(size / 2).toBe(POPUP_SKY.r0 - 1);
    // Small enough that the brand's small crest is the one drawn (under 64 px).
    expect(size).toBeLessThan(64);
  });

  it('keeps the heart of the badge out of the hit test; only its rim borders the wider band of the rays', () => {
    const { left, top, size } = crestPlacement();
    const cx = left + size / 2;
    const cy = top + size / 2;

    // The band reaches 8 px inside the rays so a pointer need not hit a hairline: within that, the badge is no ray.
    for (const [dx, dy] of [[0, 0], [0, -(POPUP_SKY.r0 - 9)], [POPUP_SKY.r0 - 9, 0], [-12, -12]])
      expect(rayIndexAt(cx + dx, cy + dy)).toBeNull();
    expect(rayIndexAt(cx, cy - (POPUP_SKY.r0 - 2))).not.toBeNull();
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
