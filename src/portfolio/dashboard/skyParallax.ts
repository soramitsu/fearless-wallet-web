import { onActivated, onBeforeUnmount, onDeactivated, onMounted, type Ref } from 'vue';

/**
 * Cursor parallax for the portfolio sky (design spec 7). The pointer's place in the popup is a deflection from its centre,
 * -1 to 1 on each axis, which the sky eases toward. The eased value goes to `--sky-x` and `--sky-y` on the sky, and each
 * layer's CSS moves it by its own depth from there, opposite to the cursor: nearer layers move further. The maths is the
 * design's reference port (design/portfolio-dashboard/reference/web/parallaxMath.ts), shared with iOS and Android.
 */
export const CURSOR_SMOOTH_TAU_MS = 150;
export const SETTLE_EPS = 0.0006;
/** The longest step one frame may take, so a frame after a stall does not jump. */
const MAX_FRAME_MS = 64;

/** Px at full deflection, x then y, for the Chrome popup: about 1.3 times the phone depths (design spec 7.4). */
export const SKY_DEPTHS = {
  stars: [4, 2.8],
  fan: [9, 6.3],
  glow: [10, 0],
  wings: [16, 9.6],
  sun: [26, 15.6],
} as const satisfies Record<string, readonly [number, number]>;
/** The wings also turn, by this much at full horizontal deflection. */
export const WINGS_TILT_DEG = 1.4;

export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** One exponential smoothing step toward the target. */
export const smoothStep = (value: number, target: number, dtMs: number, tauMs: number): number =>
  value + (target - value) * (1 - Math.exp(-dtMs / tauMs));

/** Smoothed 2D value. The caller runs a frame loop only while step() has not returned true. */
export class Smooth2D {
  x = 0;
  y = 0;
  tx = 0;
  ty = 0;

  constructor(private readonly tauMs: number) {}

  /** Advances by dtMs and returns true once the value has settled on the target. */
  step(dtMs: number): boolean {
    this.x = smoothStep(this.x, this.tx, dtMs, this.tauMs);
    this.y = smoothStep(this.y, this.ty, dtMs, this.tauMs);

    const settled = Math.abs(this.tx - this.x) < SETTLE_EPS && Math.abs(this.ty - this.y) < SETTLE_EPS;

    if (settled) {
      this.x = this.tx;
      this.y = this.ty;
    }

    return settled;
  }
}

/** The pointer as a deflection from the centre of the view: -1 at the left and top edges, 1 at the right and bottom. */
export const pointerDeflection = (clientX: number, clientY: number, width: number, height: number): { x: number; y: number } => ({
  x: width > 0 ? clamp((clientX / width) * 2 - 1, -1, 1) : 0,
  y: height > 0 ? clamp((clientY / height) * 2 - 1, -1, 1) : 0,
});

/** Layer translation in px: opposite to the input, nearer layers (larger depth) move more. */
export const layerOffset = (x: number, y: number, [depthX, depthY]: readonly [number, number]): { dx: number; dy: number } => ({
  dx: -x * depthX,
  dy: -y * depthY,
});

/**
 * Moves the sky with the cursor anywhere over the popup or page, and eases it back to rest when the cursor leaves. Only
 * while every gate holds (design spec 7.1): Full visual effects, no system Reduce Motion, the page visible and the sky on
 * screen. Nothing runs while the cursor is still: the frame loop starts on input and stops once the sky has settled.
 */
export function useSkyParallax(sky: Ref<HTMLElement | undefined>): { deflection: () => { x: number; y: number } } {
  const smooth = new Smooth2D(CURSOR_SMOOTH_TAU_MS);
  let frame = 0;
  let last = 0;
  let onScreen = true;
  let listening = false;
  let reduceMotion: MediaQueryList | undefined;
  let intersection: IntersectionObserver | undefined;
  let effects: MutationObserver | undefined;

  const open = (): boolean =>
    document.documentElement.dataset.fwEffects === 'full' && !reduceMotion?.matches && document.visibilityState !== 'hidden' && onScreen;

  const paint = (): void => {
    sky.value?.style.setProperty('--sky-x', smooth.x.toFixed(4));
    sky.value?.style.setProperty('--sky-y', smooth.y.toFixed(4));
  };

  const tick = (now: number): void => {
    const settled = smooth.step(Math.min(MAX_FRAME_MS, Math.max(0, now - last)));

    last = now;
    paint();
    frame = settled ? 0 : requestAnimationFrame(tick);
  };

  const aim = (x: number, y: number): void => {
    const live = open();

    smooth.tx = live ? x : 0;
    smooth.ty = live ? y : 0;

    if (!frame && (smooth.tx !== smooth.x || smooth.ty !== smooth.y)) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  };

  // A touch has no hover, so it never moves the sky.
  const onMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;

    const { x, y } = pointerDeflection(event.clientX, event.clientY, window.innerWidth, window.innerHeight);

    aim(x, y);
  };
  // No related target: the pointer has left the window. The popup gets no events from outside itself.
  const onOut = (event: PointerEvent): void => {
    if (!event.relatedTarget) aim(0, 0);
  };
  const toRest = (): void => aim(0, 0);
  const onGate = (): void => {
    if (!open()) aim(0, 0);
  };

  function start(): void {
    if (listening || !sky.value) return;

    listening = true;
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    reduceMotion?.addEventListener?.('change', onGate);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('blur', toRest);
    document.addEventListener('visibilitychange', onGate);

    if (typeof IntersectionObserver !== 'undefined') {
      intersection = new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        onGate();
      });
      intersection.observe(sky.value);
    }
    if (typeof MutationObserver !== 'undefined') {
      effects = new MutationObserver(onGate);
      effects.observe(document.documentElement, { attributes: true, attributeFilter: ['data-fw-effects'] });
    }
  }

  // Hidden (another screen kept alive over it) or gone: back to rest at once, with nothing left listening.
  function stop(): void {
    if (!listening) return;

    listening = false;
    reduceMotion?.removeEventListener?.('change', onGate);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerout', onOut);
    window.removeEventListener('blur', toRest);
    document.removeEventListener('visibilitychange', onGate);
    intersection?.disconnect();
    effects?.disconnect();
    intersection = undefined;
    effects = undefined;
    onScreen = true;

    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    smooth.x = smooth.y = smooth.tx = smooth.ty = 0;
    paint();
  }

  onMounted(start);
  onActivated(start);
  onDeactivated(stop);
  onBeforeUnmount(stop);

  return { deflection: () => ({ x: smooth.x, y: smooth.y }) };
}
