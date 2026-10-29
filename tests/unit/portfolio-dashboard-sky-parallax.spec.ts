import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import { POPUP_SKY, rayAngle } from '@/portfolio/dashboard/skyGeometry';
import { SETTLE_EPS, SKY_DEPTHS, Smooth2D, layerOffset, pointerDeflection, smoothStep } from '@/portfolio/dashboard/skyParallax';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';

describe('sky parallax maths', () => {
  it('eases toward the target and settles on it exactly', () => {
    const smooth = new Smooth2D(150);

    smooth.tx = 1;
    smooth.ty = -0.5;
    expect(smooth.step(150)).toBe(false);
    expect(smooth.x).toBeCloseTo(1 - Math.exp(-1), 10);
    expect(smoothStep(0, 1, 150, 150)).toBeCloseTo(smooth.x, 10);

    let frames = 0;
    while (!smooth.step(16)) frames += 1;
    expect([smooth.x, smooth.y]).toEqual([1, -0.5]);
    expect(frames).toBeLessThan(120);
    expect(SETTLE_EPS).toBeLessThan(0.001);
  });

  it('reads the pointer as a deflection from the middle of the view, -1 to 1', () => {
    expect(pointerDeflection(0, 0, 561, 600)).toEqual({ x: -1, y: -1 });
    expect(pointerDeflection(280.5, 300, 561, 600)).toEqual({ x: 0, y: 0 });
    expect(pointerDeflection(561, 600, 561, 600)).toEqual({ x: 1, y: 1 });
    expect(pointerDeflection(900, -40, 561, 600)).toEqual({ x: 1, y: -1 });
    expect(pointerDeflection(10, 10, 0, 0)).toEqual({ x: 0, y: 0 });
  });

  it('moves nearer layers further, opposite to the cursor', () => {
    expect(layerOffset(1, -1, SKY_DEPTHS.fan)).toEqual({ dx: -9, dy: 6.3 });
    expect(layerOffset(-1, 0, SKY_DEPTHS.sun).dx).toBeGreaterThan(layerOffset(-1, 0, SKY_DEPTHS.wings).dx);
    expect(layerOffset(-1, 0, SKY_DEPTHS.wings).dx).toBeGreaterThan(layerOffset(-1, 0, SKY_DEPTHS.stars).dx);
  });
});

describe('sky parallax in the popup', () => {
  const groups: AllocationGroup[] = [
    { key: 'eth', name: 'ETH', value: 60, share: 60, rays: 60, slot: 1 },
    { key: 'dot', name: 'DOT', value: 40, share: 40, rays: 40, slot: 2 },
  ];
  let frames: FrameRequestCallback[];
  let now: number;
  let reduceMotion: boolean;

  /** Runs animation frames 16 ms apart until none is asked for, or the limit. */
  const runFrames = (limit = 400) => {
    for (let index = 0; index < limit && frames.length; index += 1) {
      now += 16;
      frames.shift()?.(now);
    }
  };
  const move = (clientX: number, clientY: number, pointerType = 'mouse') =>
    window.dispatchEvent(new PointerEvent('pointermove', { clientX, clientY, pointerType }));
  const deflection = (sky: HTMLElement) => [Number(sky.style.getPropertyValue('--sky-x') || 0), Number(sky.style.getPropertyValue('--sky-y') || 0)];

  beforeEach(() => {
    frames = [];
    now = 1000;
    reduceMotion = false;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {
      frames = [];
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce') && reduceMotion, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList
    );
    document.documentElement.dataset.fwEffects = 'full';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.fwEffects;
    document.body.innerHTML = '';
  });

  const mountSky = () => {
    const wrapper = mount(PortfolioSky, { attachTo: document.body, props: { groups, activeKey: null } });

    return { wrapper, sky: wrapper.get('[data-testid="portfolioSky"]').element as HTMLElement };
  };

  it('follows the cursor anywhere over the popup and goes back to rest when it leaves', async () => {
    const { wrapper, sky } = mountSky();

    // Nothing runs until the cursor moves.
    expect(frames).toHaveLength(0);
    move(0, 0);
    runFrames();
    expect(deflection(sky)).toEqual([-1, -1]);
    // Settled: the frame loop has stopped.
    expect(frames).toHaveLength(0);

    window.dispatchEvent(new PointerEvent('pointerout', { relatedTarget: null }));
    runFrames();
    expect(deflection(sky)).toEqual([0, 0]);
    wrapper.unmount();
  });

  it('stays still for a touch, at Lite or Reduced effects and with Reduce Motion', async () => {
    const { wrapper, sky } = mountSky();

    move(0, 0, 'touch');
    expect(frames).toHaveLength(0);

    document.documentElement.dataset.fwEffects = 'lite';
    move(0, 0);
    runFrames();
    expect(deflection(sky)).toEqual([0, 0]);

    document.documentElement.dataset.fwEffects = 'full';
    reduceMotion = true;
    wrapper.unmount();

    // The system setting is read when the sky starts listening.
    const again = mountSky();
    move(0, 0);
    runFrames();
    expect(deflection(again.sky)).toEqual([0, 0]);
    again.wrapper.unmount();
  });

  it('glides back to rest when the effects tier drops while the sky is moved', async () => {
    const { wrapper, sky } = mountSky();

    move(window.innerWidth, window.innerHeight);
    runFrames();
    expect(deflection(sky)).toEqual([1, 1]);

    document.documentElement.dataset.fwEffects = 'reduced';
    await flushPromises();
    runFrames();
    expect(deflection(sky)).toEqual([0, 0]);
    wrapper.unmount();
  });

  it('stops listening once the sky is gone', () => {
    const { wrapper } = mountSky();

    wrapper.unmount();
    move(0, 0);
    expect(frames).toHaveLength(0);
  });

  it('finds the ray where the fan is drawn, moved by the parallax', async () => {
    const { wrapper, sky } = mountSky();

    vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: POPUP_SKY.w, height: POPUP_SKY.h } as DOMRect);
    // The cursor at the far right: the fan has moved 9 px left and, the cursor being at mid-height, not up or down.
    move(window.innerWidth, window.innerHeight / 2);
    runFrames();
    expect(deflection(sky)).toEqual([1, 0]);

    // A point on the first DOT ray as the fan is drawn now. Where the fan rests, that point is over an ETH ray.
    const angle = rayAngle(60);
    const radius = (POPUP_SKY.r0 + POPUP_SKY.r1) / 2;
    const clientX = POPUP_SKY.cx + Math.sin(angle) * radius - SKY_DEPTHS.fan[0];
    const clientY = POPUP_SKY.cy - Math.cos(angle) * radius;

    await wrapper.get('[data-testid="portfolioSky"]').trigger('click', { clientX, clientY });
    expect(wrapper.emitted('select')).toEqual([['dot']]);
    wrapper.unmount();
  });
});
