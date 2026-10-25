import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type { NetworkParams } from '@/stores/staking/types';

const mocks = vi.hoisted(() => ({
  accounts: null as unknown as {
    accounts: Array<{ address: string; walletSecurityGeneration?: number }>;
    selectedWallet: { address: string; name: string };
    showPolkaswapAlert: boolean;
    balances: Array<{ groupId: string; symbol: string; balances: Array<{ transferable: string }> }>;
  },
  staking: null as unknown as Record<string, unknown>, pools: null as unknown as Record<string, unknown>,
  route: { params: { network: 'sora mainnet', paramsLoaded: 'true', marketId: '7' }, query: { asset1Key: 'xor', asset2Key: 'val' } },
  farming: vi.fn(), mutateFarm: vi.fn(), market: vi.fn(), quote: vi.fn(), mutateMarket: vi.fn(),
  rewards: vi.fn(), payoutFee: vi.fn(),
  validAmount: vi.fn(), balance: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/stores/staking', () => ({ useStakingStore: () => mocks.staking }));
vi.mock('@/stores/pools', () => ({ usePoolsStore: () => mocks.pools }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({
  soraFees: { AddLiquidity: '0.1', RemoveLiquidity: '0.1' },
  networks: [],
  getAssetPrice: () => ({ price: 1 }), getHistory: () => ({ nodes: [{}] }),
}) }));
vi.mock('@/router/routes', () => ({ Components: { Staking: 'Staking', Polkamarkt: 'Polkamarkt' } }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379, IS_EXTENSION: true, IS_PRODUCTION: true }));
vi.mock('@/helpers/currencies', () => ({ getUtilityAsset: () => ({ groupId: 'xor' }), getXORCurrency: () => ({}), isValidAmountAsset: mocks.validAmount }));
vi.mock('@/extension/messaging', () => ({
  getDemeterPools: mocks.farming, mutateDemeter: mocks.mutateFarm,
  getPolkamarktSnapshot: mocks.market, getPolkamarktQuote: mocks.quote, mutatePolkamarkt: mocks.mutateMarket,
  getRewards: mocks.rewards, getPayoutsFee: mocks.payoutFee, fetchBalance: mocks.balance,
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));

import MyStake from '@/screens/staking/myStake/MyStake.vue';
import StakingPage from '@/screens/staking/StakingPage.vue';
import PendingRewardForm from '@/screens/staking/myStake/rewards/PendingRewardForm.vue';
import PoolDetails from '@/screens/pools/PoolDetails.vue';
import FarmingPage from '@/screens/defi/FarmingPage.vue';
import PolkamarktPage from '@/screens/defi/polkamarkt/PolkamarktPage.vue';

const pass = { template: '<div><slot /><slot name="header" /></div>' };
const button = { props: ['text', 'disabled'], template: '<button :disabled="disabled">{{ text }}</button>' };
const global = {
  mocks: { $t: (key: string) => key, $i18n: { locale: 'en-EN' }, $n: (value: number) => String(value), $route: mocks.route, $router: { push: vi.fn(), back: vi.fn() } },
  stubs: { AboveForm: pass, ContentForm: pass, Scroll: pass, BorderButton: button, FButton: button,
    InfoRow: true, Dropdown: true, Icon: true, Loader: true, Alert: true, Popup: pass },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.accounts = reactive<typeof mocks.accounts>({
    accounts: [{ address: 'old' }, { address: 'fresh', walletSecurityGeneration: 1 }],
    selectedWallet: { address: 'old', name: 'Fixture' }, showPolkaswapAlert: false,
    balances: ['xor', 'val', 'pswap'].map((id) => ({ groupId: id, symbol: id, balances: [{ transferable: '100' }] })),
  });
  mocks.staking = { getStakingParams: vi.fn(), getStakingNetwork: () => ({
    isController: false, isOtherController: false, activeStake: '10', totalStake: '15', redeemAmount: '5',
    unbond: { sum: '5', unlocking: [] }, alerts: [{ formName: 'showBondExtraForm' }, { formName: 'showRedeemForm' }],
  }) };
  mocks.pools = { poolsItems: [], myPoolsItems: [{
    network: 'sora mainnet', isMyPool: true,
    asset1: { assetKey: 'xor', id: 'xor', name: 'XOR', tokenBalance: '5' },
    asset2: { assetKey: 'val', id: 'val', name: 'VAL', tokenBalance: '10' },
  }] };
  mocks.farming.mockResolvedValue({ available: true, canSign: true, fees: { deposit: '0.1', withdraw: '0.1', claim: '0.1' }, pools: [{
    key: 'farm', pooledTokens: '5', earnedRewards: '2', isRemoved: false, isFarm: true,
    baseAsset: { id: 'xor', symbol: 'XOR' }, poolAsset: { id: 'val', symbol: 'VAL' }, rewardAsset: { id: 'pswap', symbol: 'PSWAP' },
  }] });
  mocks.mutateFarm.mockResolvedValue({ status: true });
  mocks.market.mockResolvedValue({
    markets: [{ id: '7', title: 'Fixture market', displayStatus: 'open', probability: '0.5' }],
    history: [], positions: [], trades: [], claimable: [{ marketId: '7', traderPayout: '1000000000000000000', creatorFees: '1000000000000000000' }],
    warnings: [], account: { signable: true, hasXorForFees: true, hasKusd: true },
    capabilities: { marketState: true, quoteBuy: true, quoteSell: true, buy: true, sell: true, claimMarket: true, claimCreatorFees: true },
  });
  mocks.quote.mockResolvedValue({ resultAmount: '1', feeAmount: '0.1', networkFee: '0.1', minimumResult: '0.9' });
  mocks.mutateMarket.mockResolvedValue({ status: true });
  mocks.rewards.mockResolvedValue({ validators: [{ address: 'validator' }], payouts: [{ era: '12', validators: ['validator'] }], sum: '1' });
  mocks.payoutFee.mockResolvedValue('0.1');
  mocks.validAmount.mockReturnValue(true);
});

describe('recovery exits in the UI', () => {
  it('keeps unstake and redeem while suppressing stake, rebond, controller and validator management', async () => {
    const wrapper = shallowMount(MyStake, { global });
    expect(wrapper.find('[data-testid="unstake"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="redeem"]').exists()).toBe(true);
    for (const id of ['stakeMore', 'rebond', 'controller', 'validators']) expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(false);
    expect(wrapper.vm.actionOptions.filter(({ visibility }) => visibility).map(({ value }) => value)).toEqual(['showPendingRewardForm']);
    expect(wrapper.vm.alerts.map(({ formName }) => formName)).toEqual(['showRedeemForm']);
    wrapper.vm.openForm('showBondExtraForm');
    expect(wrapper.vm.showMainStakingForm).toBe(false);
    await wrapper.get('[data-testid="unstake"]').trigger('click');
    expect(wrapper.vm.type).toBe('unbond');
    expect(wrapper.findComponent({ name: 'MainStakingForm' }).exists()).toBe(true);
    wrapper.unmount();
  });

  it('supports liquidity removal and closes an already-open deposit when switching to recovery', async () => {
    mocks.accounts.selectedWallet.address = 'fresh';
    const wrapper = shallowMount(PoolDetails, { global });
    await flushPromises();
    await wrapper.get('[data-testid="supplyBtn"]').trigger('click');
    expect(wrapper.vm.extrinsicType).toBe('addLiquidity');
    mocks.accounts.selectedWallet.address = 'old';
    await flushPromises();
    expect(wrapper.find('[data-testid="supplyBtn"]').exists()).toBe(false);
    expect(wrapper.vm.step).toBe(4);
    await wrapper.get('[data-testid="activityBtn"]').trigger('click');
    expect(wrapper.vm.extrinsicType).toBe('removeLiquidity');
    expect(wrapper.find('[data-testid="supplyBtn"]').exists()).toBe(true);
    await wrapper.setData({ amount1: '1', amount2: '2' });
    await wrapper.get('[data-testid="supplyBtn"]').trigger('click');
    expect(wrapper.vm.header).toBe('pools.removeLiquidity');
    await wrapper.get('[data-testid="supplyBtn"]').trigger('click');
    expect(wrapper.vm.showConfirmationPasswordPopup).toBe(true);
    wrapper.unmount();
  });

  it('clears an open stake form on wallet switch so unstaking remains usable', async () => {
    mocks.accounts.selectedWallet.address = 'fresh';
    const wrapper = shallowMount(MyStake, { global });
    await wrapper.get('[data-testid="stakeMore"]').trigger('click');
    expect(wrapper.vm.type).toBe('bondExtra');
    mocks.accounts.selectedWallet.address = 'old';
    await flushPromises();
    expect(wrapper.vm.showBondExtraForm).toBe(false);
    expect(mocks.staking.getStakingParams).toHaveBeenCalledOnce();
    await wrapper.get('[data-testid="unstake"]').trigger('click');
    expect(wrapper.vm.type).toBe('unbond');
    expect(wrapper.vm.showMainStakingForm).toBe(true);
    wrapper.unmount();
  });

  it('keeps zero-stake networks reachable for reward recovery without allowing a bond', async () => {
    mocks.staking = { allStakingItems: [{ network: 'sora mainnet', totalStake: '0' }], myStakingItems: [], stakingItems: [], getStakingParams: vi.fn() };
    const wrapper = shallowMount(StakingPage, { global });
    await flushPromises();
    expect(wrapper.vm.filteredMyStakingItems).toHaveLength(1);
    expect(wrapper.vm.noStakingItems).toBe(false);
    expect(wrapper.vm.isAllTab).toBe(false);
    expect(wrapper.findComponent({ name: 'MyStakingItem' }).exists()).toBe(true);
    wrapper.vm.updateNetworkBond({ network: 'sora mainnet' } as NetworkParams);
    expect(wrapper.vm.showBond).toBe(false);
    wrapper.unmount();
  });

  it('shows an actionable claim error and prevents confirmation when the payee cannot safely receive rewards', async () => {
    mocks.payoutFee.mockRejectedValueOnce(new Error('Select the staking controller wallet to claim rewards without restaking.'));
    const wrapper = shallowMount(PendingRewardForm, { global, props: {
      stakingNetwork: { network: 'sora mainnet', isOtherController: true, payeeAddress: 'Staked', payeeName: 'Staked' },
      stakingCurrency: { groupId: 'xor', symbol: 'XOR' }, rewardedCurrency: { groupId: 'val', symbol: 'VAL' },
    } });
    await flushPromises();
    expect(mocks.rewards).toHaveBeenCalledWith({ address: 'old', network: 'sora mainnet' });
    expect(wrapper.get('[role="alert"]').text()).toContain('Select the staking controller wallet');
    expect(wrapper.vm.showLoader).toBe(false);
    expect(wrapper.vm.disabledBtn).toBe(true);
    wrapper.vm.confirm();
    expect(wrapper.vm.showConfirmationPasswordPopup).toBe(false);
    wrapper.unmount();
  });

  it('shows the existing transferable payee for a stash with a separate controller', async () => {
    const wrapper = shallowMount(PendingRewardForm, { global, props: {
      stakingNetwork: { network: 'sora mainnet', isOtherController: true, payeeAddress: 'Controller', controllerName: 'Recovery controller' },
      stakingCurrency: { groupId: 'xor', symbol: 'XOR' }, rewardedCurrency: { groupId: 'val', symbol: 'VAL' },
    } });
    await flushPromises();
    expect(wrapper.vm.payeeName).toBe('Recovery controller');
    expect(wrapper.vm.disabledBtn).toBe(false);
    wrapper.unmount();
  });

  it('uses the selected controller balance to pay recovery claim fees', async () => {
    const currency = { groupId: 'xor', symbol: 'XOR', balances: [{ transferable: '5' }] };
    const wrapper = shallowMount(PendingRewardForm, { global, props: {
      stakingNetwork: { network: 'sora mainnet', isController: true, stashAddress: 'stash' },
      stakingCurrency: currency, rewardedCurrency: { groupId: 'val', symbol: 'VAL' },
    } });
    await flushPromises();
    expect(wrapper.vm.isValidAmountAsset).toBe(true);
    expect(mocks.validAmount).toHaveBeenCalledWith(currency, 'sora mainnet', '0.1', '0');
    expect(mocks.balance).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each(['withdraw', 'claim'])('offers farm %s without a deposit action', async (operation) => {
    const wrapper = mount(FarmingPage, { global });
    await flushPromises();
    expect(wrapper.findAll('button').some((button) => button.text() === 'farmingPage.deposit')).toBe(false);
    await wrapper.findAll('button').find((button) => button.text() === `farmingPage.${operation}`)!.trigger('click');
    if (operation === 'withdraw') await wrapper.get('.action-form input').setValue('1');
    await wrapper.findAll('button').find((button) => button.text() === 'farmingPage.review')!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'farmingPage.confirm')!.trigger('click');
    await flushPromises();
    expect(mocks.mutateFarm).toHaveBeenCalledWith(expect.objectContaining({ operation }));
    wrapper.unmount();
  });

  it.each(['ab'.repeat(32), undefined, '<private-provider-detail>'])('shows an uncertain market sale safely with hash %s', async (hash) => {
    mocks.mutateMarket.mockResolvedValue({ status: false, outcome: 'unknown', hash, error: 'private provider detail' });
    const wrapper = mount(PolkamarktPage, { global });
    await flushPromises();
    await wrapper.get('.trade-ticket input').setValue('1');
    await wrapper.get('.trade-ticket button.primary').trigger('click');
    await flushPromises();
    await wrapper.get('.quote-preview button').trigger('click');
    await flushPromises();
    const message = wrapper.get('.mutation-message');
    expect(message.text()).toContain('assets.transactionStatusUnknownDetails');
    expect(message.classes()).toContain('warning');
    expect(message.classes()).not.toContain('error');
    expect(message.text()).not.toContain('polkamarktPage.fallback.mutation');
    expect(message.text()).not.toContain('private');
    expect(wrapper.find('[data-testid="polkamarktUnknownHash"]').exists()).toBe(hash === 'ab'.repeat(32));
    expect(wrapper.find('.quote-preview').exists()).toBe(false);
    expect(mocks.mutateMarket).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('offers selling existing market shares and claiming, without buying', async () => {
    const wrapper = mount(PolkamarktPage, { global });
    await flushPromises();
    expect(wrapper.findAll('.segmented button').some((button) => button.text() === 'polkamarktPage.buy')).toBe(false);
    await wrapper.get('.trade-ticket input').setValue('1');
    await wrapper.get('.trade-ticket button.primary').trigger('click');
    await flushPromises();
    expect(mocks.quote).toHaveBeenCalledWith(expect.objectContaining({ mode: 'sell' }));
    await wrapper.get('.quote-preview button').trigger('click');
    await flushPromises();
    expect(mocks.mutateMarket).toHaveBeenCalledWith(expect.objectContaining({ action: 'sell' }));
    await wrapper.findAll('.claim-card button')[0].trigger('click');
    await flushPromises();
    expect(mocks.mutateMarket).toHaveBeenCalledWith(expect.objectContaining({ action: 'claimMarket' }));
    wrapper.unmount();
  });
});
