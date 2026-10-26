import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AllocationGroup } from '@/portfolio/dashboard/allocation';
import { POPUP_SKY } from '@/portfolio/dashboard/skyGeometry';
import PortfolioSky from '@/screens/portfolio/PortfolioSky.vue';

const groups: AllocationGroup[] = [{ key: 'eth', name: 'ETH', value: 100, share: 100, rays: 100, slot: 1 }];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('portfolio sky wings', () => {
  it('run from one edge of the card the sky sits in to the other once the card is measured', async () => {
    let resized = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const wrapper = mount(PortfolioSky, { attachTo: document.body, props: { groups, activeKey: null } });
    const wings = () => wrapper.get('[data-testid="portfolioWings"]').attributes('style');

    // Unmeasured, the wings keep to the sky's own box.
    expect(wings()).toContain(`width: ${POPUP_SKY.w}px`);

    const sky = wrapper.get('[data-testid="portfolioSky"]').element as HTMLElement;
    const card = sky.parentElement as HTMLElement;

    // The popup's card: 522 wide at x 16 with a 1 px border, the sky at its right edge.
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 16 } as DOMRect);
    Object.defineProperties(card, { clientLeft: { value: 1 }, clientWidth: { value: 520 } });
    vi.spyOn(sky, 'getBoundingClientRect').mockReturnValue({ left: 17 + 520 - POPUP_SKY.w, width: POPUP_SKY.w } as DOMRect);
    resized();
    await flushPromises();

    expect(wings()).toContain(`left: ${POPUP_SKY.cx - 389}px`);
    expect(wings()).toContain('width: 520px');
    expect(wrapper.findAll('[data-testid="portfolioWings"] path')).toHaveLength(9);
    wrapper.unmount();
  });
});
