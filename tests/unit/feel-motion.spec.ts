import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { COUNT_UP_MS, countUpFrame, useCountUp } from '@/feel/countUp';
import { LAUNCH_REVEAL_EVENT, claimListEntrance, resetFeelMotion } from '@/feel/motion';
import { IGNITE_REST, SOLAR, strokeProgress, solarPath, solarTicks } from '@/feel/solarGeometry';

// Brand kit v3 SPEC part 3: the living balance, the list entrance and the solar geometry.
beforeEach(() => {
  resetFeelMotion();
  delete document.documentElement.dataset.fwEffects;
});
afterEach(() => vi.unstubAllGlobals());

describe('the living balance', () => {
  it('eases from one value to the next and lands exactly on it', () => {
    expect(countUpFrame(0, 100, 0)).toBe('0.00');
    expect(Number(countUpFrame(0, 100, 0.5))).toBeGreaterThan(50);
    expect(countUpFrame(0, 1234.56, 1)).toBe('1234.56');
    expect(countUpFrame(10, 5, 2)).toBe('5.00');
  });

  it('counts up from zero on its first reveal in the page, and shows the final value at the end', async () => {
    const total = ref('1234.56');
    const scope = effectScope();
    const shown = scope.run(() => useCountUp(() => total.value, () => true))!;

    expect(shown.value).toBe('0.00');
    await vi.waitFor(() => expect(shown.value).toBe('1234.56'), { timeout: COUNT_UP_MS * 4 });
    total.value = '1300';
    await nextTick();
    expect(Number(shown.value)).toBeLessThan(1300);
    await vi.waitFor(() => expect(shown.value).toBe('1300'), { timeout: COUNT_UP_MS * 4 });
    scope.stop();
  });

  it('starts the first count only when the launch shows the wallet', async () => {
    const launch = { revealed: false };
    (window as Window & { __fwLaunch?: unknown }).__fwLaunch = launch;
    const scope = effectScope();
    const shown = scope.run(() => useCountUp(() => '80', () => true))!;
    try {
      await new Promise((resolve) => setTimeout(resolve, 120));
      expect(shown.value).toBe('0.00');
      launch.revealed = true;
      window.dispatchEvent(new Event(LAUNCH_REVEAL_EVENT));
      await vi.waitFor(() => expect(shown.value).toBe('80'), { timeout: COUNT_UP_MS * 4 });
    } finally {
      scope.stop();
      delete (window as Window & { __fwLaunch?: unknown }).__fwLaunch;
    }
  });

  it('shows the value at once on a later reveal, while loading, and under the Reduced paint', () => {
    const scope = effectScope();
    scope.run(() => useCountUp(() => '5', () => true));
    const later = scope.run(() => useCountUp(() => '7.5', () => true))!;
    const loading = scope.run(() => useCountUp(() => '9', () => false))!;
    expect(later.value).toBe('7.5');
    expect(loading.value).toBe('9');

    resetFeelMotion();
    document.documentElement.dataset.fwEffects = 'reduced';
    const reduced = scope.run(() => useCountUp(() => '42', () => true))!;
    expect(reduced.value).toBe('42');
    scope.stop();
  });
});

describe('the list entrance', () => {
  it('lets the rows of the first list rise in, once per page', () => {
    expect(claimListEntrance(1000)).toBe(true);
    expect(claimListEntrance(2400)).toBe(true);
    expect(claimListEntrance(2600)).toBe(false);
  });

  it('keeps rows still under the Reduced paint', () => {
    document.documentElement.dataset.fwEffects = 'reduced';
    expect(claimListEntrance(0)).toBe(false);
  });
});

describe('the solar geometry from the kit', () => {
  it('draws each stroke over its own part of the ignite', () => {
    expect(strokeProgress([0.2, 0.4], 0.1)).toBe(0);
    expect(strokeProgress([0.2, 0.4], 0.3)).toBeCloseTo(0.5);
    expect(strokeProgress([0.2, 0.4], 0.9)).toBe(1);
    expect(IGNITE_REST).toBe(0.25);
  });

  it('builds the rings, the lattice and the tick ring from the kit file', () => {
    expect(SOLAR.strokes.filter(({ group }) => group === 'ring')).toHaveLength(2);
    expect(solarPath(['ring']).match(/M/g)).toHaveLength(2);
    expect(solarPath(['lattice']).length).toBeGreaterThan(100);
    expect(solarTicks()).toHaveLength(SOLAR.ticks.count);
  });
});
