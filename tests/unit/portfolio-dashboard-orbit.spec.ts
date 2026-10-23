import { POPUP_ORBIT, orbitLayout, orbitNetworks } from '@/portfolio/dashboard/orbit';

describe('orbit layout', () => {
  const geometry = POPUP_ORBIT;

  it('puts no satellite where there is nothing to show, and never more than the orbit holds', () => {
    expect(orbitLayout(0)).toEqual([]);
    expect(orbitLayout(-3)).toEqual([]);
    expect(orbitLayout(99)).toHaveLength(geometry.maxSatellites);
  });

  it('keeps every satellite inside the orbit, whatever their number', () => {
    for (let count = 1; count <= geometry.maxSatellites; count += 1) {
      orbitLayout(count).forEach(({ x, y }) => {
        expect(x - geometry.satellite / 2).toBeGreaterThanOrEqual(0);
        expect(x + geometry.satellite / 2).toBeLessThanOrEqual(geometry.w);
        expect(y - geometry.satellite / 2).toBeGreaterThanOrEqual(0);
        expect(y + geometry.satellite / 2).toBeLessThanOrEqual(geometry.h);
      });
    }
  });

  it('keeps satellites apart from each other, from the orb and from the Polkaswap node', () => {
    for (let count = 1; count <= geometry.maxSatellites; count += 1) {
      const satellites = orbitLayout(count);

      satellites.forEach((satellite, index) => {
        expect(Math.hypot(satellite.x - geometry.cx, satellite.y - geometry.cy)).toBeGreaterThan((geometry.orb + geometry.satellite) / 2);
        expect(Math.hypot(satellite.x - geometry.swap.x, satellite.y - geometry.swap.y)).toBeGreaterThan((geometry.swapSize + geometry.satellite) / 2);
        satellites.slice(index + 1).forEach((other) => {
          expect(Math.hypot(satellite.x - other.x, satellite.y - other.y), `${count} satellites`).toBeGreaterThanOrEqual(geometry.satellite);
        });
      });
    }
  });

  it('sits a lone satellite at the front of the ring, and spreads more from the right-hand end round to the top left', () => {
    expect(orbitLayout(1)[0]).toMatchObject({ x: geometry.cx, front: true });
    const four = orbitLayout(4);

    expect(four.map(({ index }) => index)).toEqual([0, 1, 2, 3]);
    expect(four[0].x).toBeGreaterThan(geometry.cx);
    expect(four[3].x).toBeLessThan(geometry.cx);
  });

  it('draws the near half of the ring larger than the far half', () => {
    orbitLayout(7).forEach(({ scale, front }) => {
      expect(scale).toBeGreaterThanOrEqual(0.86);
      expect(scale).toBeLessThanOrEqual(1);
      if (front) expect(scale).toBeGreaterThanOrEqual(0.93);
    });
  });

  it('is the same every time', () => {
    expect(orbitLayout(5)).toEqual(orbitLayout(5));
  });
});

describe('orbit networks', () => {
  const names = (count: number) => Array.from({ length: count }, (_, index) => `N${index}`);

  it('shows every network while they fit', () => {
    expect(orbitNetworks(names(7))).toEqual({ shown: names(7), folded: [] });
  });

  it('folds the smallest into one satellite when there are more, so the satellites still number what the orbit holds', () => {
    const { shown, folded } = orbitNetworks(names(10));

    expect(shown).toEqual(names(6));
    expect(folded).toEqual(names(10).slice(6));
    expect(shown.length + 1).toBe(POPUP_ORBIT.maxSatellites);
  });
});
