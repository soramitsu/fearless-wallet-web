import { RAY_COUNT, type AllocationGroup } from '@/portfolio/dashboard/allocation';
import { POPUP_SKY, chartColour, layoutRays, logoPlacement, rayAngle, rayIndexAt, rayLine, skyStars } from '@/portfolio/dashboard/skyGeometry';

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
