import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { SoraSubmissionUnknownError, soraSubmissionUnknownResponse } from '@/sora/submission';
const mocks = vi.hoisted(() => ({ load: vi.fn(), mutate: vi.fn() }));
const route = reactive({ query: { position: 'second' } });
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379, IS_EXTENSION: false }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ accounts: [], selectedWallet: { address: '' } }) }));
vi.mock('@/router/routes', () => ({ Components: { Pools: 'Pools' } }));
vi.mock('@/extension/messaging', () => ({ getDemeterPools: mocks.load, mutateDemeter: mocks.mutate }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
import FarmingPage from '@/screens/defi/FarmingPage.vue';

describe('farming Manage destination', () => {
  it.each([`0x${'ab'.repeat(32)}`, undefined])('keeps an uncertain claim visible and prevents another confirmation (hash %s)', async (hash) => {
    route.query.position = '';
    mocks.mutate.mockReset().mockResolvedValue(soraSubmissionUnknownResponse(new SoraSubmissionUnknownError(hash)));
    mocks.load.mockResolvedValue({
      available: true, canSign: true, fees: { claim: '0.01' },
      pools: [{
        key: 'position', pooledTokens: '1', earnedRewards: '1', isRemoved: false, isFarm: true,
        baseAsset: { id: 'xor', symbol: 'XOR' }, poolAsset: { id: 'val', symbol: 'VAL' },
        rewardAsset: { id: 'pswap', symbol: 'PSWAP' }, apr: null, tvl: null, depositFee: '0',
      }],
    });
    const wrapper = mount(FarmingPage, {
      global: {
        stubs: {
          ContentForm: { template: '<main><slot /></main>' }, Scroll: { template: '<div><slot /></div>' },
          Popup: { template: '<section><slot /></section>' }, Icon: true,
          FButton: { props: ['text', 'disabled'], template: '<button :disabled="disabled">{{ text }}</button>' },
        },
      },
    });
    await flushPromises();
    const button = (text: string) => wrapper.findAll('button').find((item) => item.text() === text)!;
    await button('farmingPage.claim').trigger('click');
    await button('farmingPage.review').trigger('click');
    await button('farmingPage.confirm').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="farmingSubmissionUnknown"]').text()).toContain('assets.transactionStatusUnknownDetails');
    expect(wrapper.find('.form-error').exists()).toBe(false);
    if (hash) expect(wrapper.get('[data-testid="farmingSubmissionHash"]').text()).toBe(hash.slice(2));
    else expect(wrapper.find('[data-testid="farmingSubmissionHash"]').exists()).toBe(false);
    expect(button('farmingPage.confirm').attributes('disabled')).toBeDefined();
    await button('farmingPage.confirm').trigger('click');
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('focuses the exact loaded position without selecting a similarly named pool', async () => {
    route.query.position = 'second';
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
