import { nextTick, ref } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { VALUE_TICK_QUIET_MS, tickDirection, useValueTick } from '@/feel/valueTick';

// Brand kit v4 SPEC part 5: a value the user is reading that changes says which way it went. The first value, a value
// that comes from nothing and a hidden asset say nothing.
describe('which way a shown value moved', () => {
  it('is up or down between two known values', () => {
    expect(tickDirection(10, 12)).toBe('up');
    expect(tickDirection(10, 8)).toBe('down');
  });

  it('is nothing for the first value, an unknown one, zero before it, or no change', () => {
    expect(tickDirection(null, 12)).toBeNull();
    expect(tickDirection(undefined, 12)).toBeNull();
    expect(tickDirection(10, null)).toBeNull();
    expect(tickDirection(0, 12)).toBeNull();
    expect(tickDirection(10, 10)).toBeNull();
    expect(tickDirection(Number.NaN, 10)).toBeNull();
  });
});

describe('the value tick', () => {
  afterEach(() => delete document.documentElement.dataset.fwEffects);

  const watchValue = (enabled = () => true) => {
    const value = ref<number | null>(null);
    const clock = { now: 1_000_000 };
    const tick = useValueTick(
      () => value.value,
      () => (value.value === null ? '' : value.value.toFixed(2)),
      enabled,
      () => clock.now
    );
    return { value, clock, tick };
  };

  it('says nothing for the first value, then ticks with the direction of each change', async () => {
    const { value, clock, tick } = watchValue();
    value.value = 10;
    await nextTick();
    expect(tick.value).toBeNull();

    value.value = 12;
    await nextTick();
    expect(tick.value).toEqual({ key: 1, direction: 'up' });

    clock.now += VALUE_TICK_QUIET_MS;
    value.value = 9;
    await nextTick();
    expect(tick.value).toEqual({ key: 2, direction: 'down' });
  });

  it('ticks at most once in three seconds', async () => {
    const { value, clock, tick } = watchValue();
    value.value = 10;
    await nextTick();
    value.value = 11;
    await nextTick();
    clock.now += VALUE_TICK_QUIET_MS - 1;
    value.value = 12;
    await nextTick();
    expect(tick.value?.key).toBe(1);
  });

  it('stays still when the text on screen did not change', async () => {
    const { value, tick } = watchValue();
    value.value = 10;
    await nextTick();
    value.value = 10.001;
    await nextTick();
    expect(tick.value).toBeNull();
  });

  it('never ticks for a hidden asset or under the Reduced paint', async () => {
    const hidden = watchValue(() => false);
    hidden.value.value = 10;
    await nextTick();
    hidden.value.value = 12;
    await nextTick();
    expect(hidden.tick.value).toBeNull();

    document.documentElement.dataset.fwEffects = 'reduced';
    const reduced = watchValue();
    reduced.value.value = 10;
    await nextTick();
    reduced.value.value = 12;
    await nextTick();
    expect(reduced.tick.value).toBeNull();
  });
});
