// The value tick (brand kit v4, SPEC "Shikiban" part 5): when a value the user is looking at changes, the new text
// comes in from below if it grew and from above if it shrank, and a one-point line in the price-up or price-down colour
// sweeps under it. Never on the first value, never from or to nothing, at most once in three seconds.
import { ref, watch, type Ref } from 'vue';
import { motionAllowed } from '@/feel/motion';

export const VALUE_TICK_QUIET_MS = 3000;

export type TickDirection = 'up' | 'down';
export interface ValueTick {
  /** Changes with every tick: as an element's key it restarts the animation. */
  key: number;
  direction: TickDirection;
}

/**
 * Which way a shown value moved. A value that was unknown or zero has no direction: the first price, the first
 * balance and tokens arriving in an empty row are not changes of a value the user was already reading.
 */
export function tickDirection(previous: number | null | undefined, next: number | null | undefined): TickDirection | null {
  if (previous === null || previous === undefined || next === null || next === undefined) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(next) || previous === 0 || previous === next) return null;
  return next > previous ? 'up' : 'down';
}

/**
 * Ticks when `value` changes and its `text` on screen changes with it. `enabled` is read at the change (a hidden
 * asset never ticks).
 */
export function useValueTick(
  value: () => number | null | undefined,
  text: () => string,
  enabled: () => boolean = () => true,
  now: () => number = Date.now
): Ref<ValueTick | null> {
  const tick = ref<ValueTick | null>(null);
  let lastAt = Number.NEGATIVE_INFINITY;
  let count = 0;

  watch(
    () => [value(), text()] as const,
    ([next, nextText], [previous, previousText]) => {
      const direction = nextText === previousText ? null : tickDirection(previous, next);
      if (!direction || !enabled() || !motionAllowed()) return;
      const at = now();
      if (at - lastAt < VALUE_TICK_QUIET_MS) return;
      lastAt = at;
      count += 1;
      tick.value = { key: count, direction };
    }
  );

  return tick;
}
