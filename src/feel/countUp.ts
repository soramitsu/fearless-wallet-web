// The living balance (brand kit v3, SPEC part 3 item 3): the total counts to its value in 0.6 s whenever it changes,
// from zero on its first reveal in the page. Only the digits on screen move; the accessible label and anything copied
// always read the final value.
import { onScopeDispose, ref, watch, type Ref } from 'vue';
import { claimFirstBalanceReveal, motionAllowed } from '@/feel/motion';

export const COUNT_UP_MS = 600;
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/** The value shown `progress` of the way from `from` to `to`, with the target's two decimals. */
export function countUpFrame(from: number, to: number, progress: number): string {
  const t = Math.min(1, Math.max(0, progress));
  return (from + (to - from) * easeOutCubic(t)).toFixed(2);
}

export function useCountUp(target: () => string, active: () => boolean): Ref<string> {
  const shown = ref(target());
  let frame = 0;
  let revealed = false;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };

  const run = (fromText: string, toText: string) => {
    stop();
    const from = Number(fromText);
    const to = Number(toText);
    if (!motionAllowed() || !Number.isFinite(from) || !Number.isFinite(to) || from === to || typeof requestAnimationFrame !== 'function') {
      shown.value = toText;
      return;
    }
    const start = performance.now();
    // The first frame now, before the page paints: the final value never flashes before the count.
    shown.value = countUpFrame(from, to, 0);
    const step = (now: number) => {
      const progress = (now - start) / COUNT_UP_MS;
      if (progress >= 1) {
        frame = 0;
        shown.value = toText;
        return;
      }
      shown.value = countUpFrame(from, to, progress);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  watch(
    [target, active],
    ([value, isActive], previous) => {
      if (!isActive) {
        stop();
        shown.value = value;
        return;
      }
      if (!revealed) {
        revealed = true;
        if (claimFirstBalanceReveal()) {
          run('0', value);
          return;
        }
        shown.value = value;
        return;
      }
      const before = previous?.[0];
      if (before !== undefined && before !== value) run(shown.value, value);
      else if (!frame) shown.value = value;
    },
    { immediate: true }
  );

  onScopeDispose(stop);
  return shown;
}
