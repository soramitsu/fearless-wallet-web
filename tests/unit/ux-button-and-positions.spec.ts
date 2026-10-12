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
const extension = reactive({ features: undefined as { actions: Record<string, boolean> } | undefined });
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379, IS_PRODUCTION: false }));
vi.mock('@/consts/sora', () => ({ SORA_NETWORK_NAME: 'sora mainnet' }));
vi.mock('@/router/routes', () => ({ Components: {} }));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => accounts }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => extension }));
vi.mock('@/stores/staking', () => ({ useStakingStore: () => ({ updateStakingParams: mocks.updateStake }) }));
vi.mock('@/stores/pools', () => ({ usePoolsStore: () => ({ updatePoolsParams: mocks.updatePools }) }));
vi.mock('@/extension/messaging/staking', () => ({ getStakingParams: mocks.staking }));
vi.mock('@/extension/messaging/pools', () => ({ getPoolsParams: mocks.pools, getDemeterPools: mocks.farming }));
vi.mock('@/extension/messaging/polkamarkt', () => ({ getPolkamarktSnapshot: mocks.markets }));
import { RELEASE_DEFAULT_ACTIONS } from '@extension-base/services/action-capability-service';
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
  extension.features = undefined;
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
  it('labels DeFi entries the release policy keeps browse-only, without hiding them', async () => {
    const wrapper = mount(DeFiHub, { global: { stubs } });
    await flushPromises();
    // Nothing is claimed before capabilities load.
    expect(wrapper.get('[data-testid="farmingCapability"]').text()).toBe('SORA');
    expect(wrapper.get('[data-testid="polkamarktCapability"]').text()).toBe('defiHub.soraXorFees');

    extension.features = { actions: { ...RELEASE_DEFAULT_ACTIONS } };
    await flushPromises();
    expect(wrapper.get('[data-testid="farmingCapability"]').text()).toBe('defiHub.browseOnly');
    expect(wrapper.get('[data-testid="polkamarktCapability"]').text()).toBe('defiHub.browseOnly');
    expect(wrapper.findAll('.hub-row')).toHaveLength(4);

    extension.features = { actions: { ...RELEASE_DEFAULT_ACTIONS, demeter: true, polkamarkt: true } };
    await flushPromises();
    expect(wrapper.get('[data-testid="farmingCapability"]').text()).toBe('SORA');
    expect(wrapper.get('[data-testid="polkamarktCapability"]').text()).toBe('defiHub.soraXorFees');
    wrapper.unmount();
  });
});

describe('focusable unavailable actions', () => {
  it('keeps its reason linked while preventing DOM, keyboard-generated and parent actions', async () => {
    const action = vi.fn();
    const wrapper = mount(FButton, {
      attachTo: document.body,
      props: {
        text: 'Export',
        disabled: true,
        focusableWhenDisabled: true,
        disabledReason: 'migration.exportLegacyVaultUnavailable',
        onClick: action,
      },
    });
    const button = wrapper.get('button');
    button.element.focus();
    expect(document.activeElement).toBe(button.element);
    expect(button.attributes('disabled')).toBeUndefined();
    expect(button.attributes('aria-disabled')).toBe('true');
    expect(button.attributes('aria-describedby')).toBe(wrapper.get('.button-disabled-reason').attributes('id'));
    await button.trigger('keydown', { key: 'Enter' });
    await button.trigger('keyup', { key: ' ' });
    button.element.click();
    button.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(action).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false, loading: true });
    button.element.click();
    expect(action).not.toHaveBeenCalled();
    expect(button.attributes('aria-busy')).toBe('true');
    await wrapper.setProps({ loading: false });
    expect(button.attributes('aria-describedby')).toBeUndefined();
    button.element.click();
    expect(action).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('retains native disabled behavior unless explicitly opted in', () => {
    const wrapper = mount(FButton, { props: { text: 'Continue', disabled: true } });
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
