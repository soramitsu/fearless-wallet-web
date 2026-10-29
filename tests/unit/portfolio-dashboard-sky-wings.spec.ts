import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import { POPUP_SKY, WING_OUT } from '@/portfolio/dashboard/skyGeometry';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';

const groups: AllocationGroup[] = [{ key: 'eth', name: 'ETH', value: 100, share: 100, rays: 100, slot: 1 }];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

/** The page around the sky: a scroll area that clips sideways (the stage), and the hero card in it. */
function mountInPage() {
  let resized = () => {};
  const observed: Element[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    }
  );
  const stage = document.createElement('div');
  const card = document.createElement('div');
  stage.style.overflowX = 'hidden';
  stage.appendChild(card);
  document.body.appendChild(stage);

  const wrapper = mount(PortfolioSky, { attachTo: card, props: { groups, activeKey: null } });
  const sky = wrapper.get('[data-testid="portfolioSky"]').element as HTMLElement;
  const place = (element: Element, left: number, clientWidth: number, clientLeft = 0) => {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left, width: clientWidth + 2 * clientLeft } as DOMRect);
    Object.defineProperties(element, { clientLeft: { value: clientLeft, configurable: true }, clientWidth: { value: clientWidth, configurable: true } });
  };

  return { wrapper, sky, card: sky.parentElement as HTMLElement, stage, observed, place, resize: () => resized() };
}

describe('portfolio sky wings', () => {
  it('run out of the card to the edges of the scroll area around it once both are measured', async () => {
    const { wrapper, sky, card, stage, observed, place, resize } = mountInPage();
    const wings = () => wrapper.get('[data-testid="portfolioWings"]').attributes('style');

    // Unmeasured, the wings keep to the sky's own box.
    expect(wings()).toContain(`width: ${POPUP_SKY.w}px`);
    // The card and the scroll area are both watched: the sky moves in one, the other changes with the window.
    expect(observed).toEqual([card, stage]);

    // The popup: a 561 px window with a 6 px scrollbar; the card 523 wide at x 16, the sky at the right edge of its
    // 1 px padding.
    place(stage, 0, 555);
    place(card, 16, 523);
    vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 16 + 523 - 1 - POPUP_SKY.w, width: POPUP_SKY.w } as DOMRect);
    resize();
    await flushPromises();

    // From the window's left edge to the scrollbar, out of the card on each side.
    expect(wings()).toContain(`left: ${POPUP_SKY.cx - 407}px`);
    expect(wings()).toContain('width: 555px');
    // Out of the card, beside the text, the wing is drawn in full; inside the card it is veiled.
    expect(wings()).toMatch(/#000 16px, rgb\(0 0 0 \/ var\(--sky-veil, 1\)\) 16px/);
    expect(wrapper.findAll('[data-testid="portfolioWings"] path')).toHaveLength(9);
    wrapper.unmount();
  });

  it('end well past the card and fade out in a window much wider than the card', async () => {
    const { wrapper, sky, stage, card, place, resize } = mountInPage();
    const wings = () => wrapper.get('[data-testid="portfolioWings"]').attributes('style');

    // A full tab: the 561 px column in the middle of a 1280 px window.
    place(stage, 0, 1274);
    place(card, 375.5, 523);
    vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 375.5 + 523 - 1 - POPUP_SKY.w, width: POPUP_SKY.w } as DOMRect);
    resize();
    await flushPromises();

    expect(wings()).toContain(`width: ${523 + 2 * WING_OUT}px`);
    expect(wings()).toMatch(/linear-gradient\(to right, transparent 0,.*transparent 100%\)/);
    wrapper.unmount();
  });
});
