import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
const route = reactive({ query: { position: 'second' } });
vi.mock('vue-router', () => ({ useRoute: () => route }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379 }));
vi.mock('@/extension/messaging', () => ({ getDemeterPools: mocks.load, mutateDemeter: vi.fn() }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import FarmingPage from '@/screens/defi/FarmingPage.vue';

describe('farming Manage destination', () => {
  it('focuses the exact loaded position without selecting a similarly named pool', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const pool = (key: string, pooledTokens = '1') => ({
      key,
      pooledTokens,
      earnedRewards: '0',
      isRemoved: false,
      baseAsset: { symbol: 'XOR' },
      poolAsset: { symbol: 'VAL' },
      rewardAsset: { symbol: 'PSWAP' },
      apr: null,
      tvl: null,
      depositFee: '0',
    });
    mocks.load.mockResolvedValue({
      available: true,
      canSign: false,
      pools: [pool('first'), pool('second'), pool('empty', '0.00')],
    });
    const wrapper = mount(FarmingPage, {
      attachTo: document.body,
      global: {
        stubs: {
          ContentForm: { template: '<main><slot /></main>' },
          Scroll: { template: '<div><slot /></div>' },
          Icon: true,
        },
      },
    });
    await flushPromises();
    expect(document.activeElement?.getAttribute('data-position-key')).toBe('second');
    expect(wrapper.findAll('[data-position-key]')).toHaveLength(2);
    expect(scroll).toHaveBeenCalled();
    route.query.position = 'first';
    await flushPromises();
    expect(document.activeElement?.getAttribute('data-position-key')).toBe('first');
    wrapper.unmount();
  });
});
