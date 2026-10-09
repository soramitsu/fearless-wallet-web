import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  staking: vi.fn(),
  pools: vi.fn(),
  farming: vi.fn(),
  markets: vi.fn(),
  updateStake: vi.fn(),
  updatePools: vi.fn(),
  push: vi.fn(),
}));
const accounts = reactive({ selectedWallet: { address: 'wallet-a', isSubstrate: true } });
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379 }));
vi.mock('@/consts/sora', () => ({ SORA_NETWORK_NAME: 'sora mainnet' }));
vi.mock('@/router/routes', () => ({ Components: {} }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => accounts }));
vi.mock('@/stores/staking', () => ({ useStakingStore: () => ({ updateStakingParams: mocks.updateStake }) }));
vi.mock('@/stores/pools', () => ({ usePoolsStore: () => ({ updatePoolsParams: mocks.updatePools }) }));
vi.mock('@/extension/messaging/staking', () => ({ getStakingParams: mocks.staking }));
vi.mock('@/extension/messaging/pools', () => ({ getPoolsParams: mocks.pools, getDemeterPools: mocks.farming }));
vi.mock('@/extension/messaging/polkamarkt', () => ({ getPolkamarktSnapshot: mocks.markets }));
import FButton from '@/components/FButton.vue';
import DeFiHub from '@/screens/defi/DeFiHub.vue';
const stubs = {
  Icon: true,
  ContentForm: { template: '<main><slot /></main>' },
  Scroll: { template: '<div><slot /></div>' },
};

beforeEach(() => {
  vi.clearAllMocks();
  accounts.selectedWallet.address = 'wallet-a';
  mocks.staking.mockResolvedValue([]);
  mocks.pools.mockResolvedValue([]);
  mocks.farming.mockResolvedValue({ available: true, pools: [] });
  mocks.markets.mockResolvedValue({ positions: [], claimable: [], markets: [], indexerStale: false });
});

describe('wallet UX interactions', () => {
  it('dispatches one parent action per native button click', async () => {
    const action = vi.fn();
    const wrapper = mount(
      defineComponent({
        components: { FButton },
        setup: () => ({ action }),
        template: '<FButton text="Create" @click="action" />',
      })
    );
    await wrapper.get('button').trigger('click');
    expect(action).toHaveBeenCalledOnce();
    wrapper.unmount();
  });
  it('does not display a false empty wallet when a source fails', async () => {
    mocks.staking.mockRejectedValue(new Error('offline'));
    const wrapper = mount(DeFiHub, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain('ux.incompletePositions');
    expect(wrapper.text()).not.toContain('ux.positionsEmpty');
    await wrapper.get('.refresh-positions').trigger('click');
    expect(mocks.staking).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
  it('discards late results after switching wallets', async () => {
    let finishA!: (positions: unknown[]) => void;
    mocks.staking.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishA = resolve;
        })
    );
    const wrapper = mount(DeFiHub, { global: { stubs } });
    await flushPromises();
    accounts.selectedWallet.address = 'wallet-b';
    await flushPromises();
    finishA([{ network: 'sora mainnet', totalStake: '999' }]);
    await flushPromises();
    expect(wrapper.findAll('.position-row')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('999');
    expect(mocks.updateStake).toHaveBeenCalledTimes(1);
    expect(mocks.updateStake).toHaveBeenCalledWith([]);
    wrapper.unmount();
  });
});
