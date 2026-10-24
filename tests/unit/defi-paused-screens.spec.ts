import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemeterPoolsResponse } from '@extension-base/services/pools-service/types';
import type { PolkamarktSnapshot } from '@/defi/polkamarkt/types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  farming: vi.fn(),
  mutateDemeter: vi.fn(),
  snapshot: vi.fn(),
  quote: vi.fn(),
  mutatePolkamarkt: vi.fn(),
  accounts: { accounts: [], selectedWallet: { address: '' }, showPolkaswapAlert: false, hidePolkaswapAlert: vi.fn() },
}));
const route = reactive({ query: {} as Record<string, string>, params: {} as Record<string, string> });

vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 379, IS_EXTENSION: true }));
vi.mock('@/router/routes', () => ({ Components: { Pools: 'Pools', Polkamarkt: 'Polkamarkt' } }));
vi.mock('@/extension/messaging', () => ({
  getDemeterPools: mocks.farming,
  mutateDemeter: mocks.mutateDemeter,
  getPolkamarktSnapshot: mocks.snapshot,
  getPolkamarktQuote: mocks.quote,
  mutatePolkamarkt: mocks.mutatePolkamarkt,
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key, tc: (key: string) => key }) }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => mocks.accounts,
}));

import FarmingPage from '@/screens/defi/FarmingPage.vue';
import PolkamarktPage from '@/screens/defi/polkamarkt/PolkamarktPage.vue';

const FButton = defineComponent({
  props: { text: { type: String, default: '' } },
  emits: ['click'],
  setup(props, { attrs, emit }) {
    return () => h('button', { ...attrs, type: 'button', onClick: () => emit('click') }, props.text);
  },
});

const stubs = {
  ContentForm: { template: '<main><slot /></main>' },
  Scroll: { template: '<div><slot /></div>' },
  Icon: true,
  Loader: true,
  Popup: { template: '<div class="popup"><slot /></div>' },
  FButton,
};

const pool = (key: string, pooledTokens: string, earnedRewards: string) => ({
  key,
  pooledTokens,
  earnedRewards,
  isFarm: true,
  isRemoved: false,
  baseAsset: { id: 'xor', symbol: 'XOR' },
  poolAsset: { id: 'val', symbol: 'VAL' },
  rewardAsset: { id: 'pswap', symbol: 'PSWAP' },
  apr: '12',
  tvl: '1000',
  depositFee: '0',
});

const catalog = (overrides: Partial<DemeterPoolsResponse>) =>
  ({
    available: true,
    canSign: true,
    actionsPaused: false,
    fees: { deposit: '0.1', withdraw: '0.1', claim: '0.1' },
    pools: [pool('position', '5', '2'), pool('open', '0', '0')],
    ...overrides,
  }) as unknown as DemeterPoolsResponse;

const mountFarming = async (response: DemeterPoolsResponse) => {
  mocks.farming.mockResolvedValue(response);
  const wrapper = mount(FarmingPage, { global: { stubs } });
  await flushPromises();

  return wrapper;
};

const actionButtons = (wrapper: Awaited<ReturnType<typeof mountFarming>>) =>
  wrapper.findAll('.pool-actions button').map((button) => ({
    label: button.text(),
    disabled: button.attributes('disabled') !== undefined,
  }));

const market = {
  id: '7',
  title: 'Will XOR close above 1?',
  category: 'Crypto',
  description: 'Resolves from the SORA runtime.',
  displayStatus: 'open',
  probability: '40',
  liquidityUsd: '100',
  volumeUsd: '50',
  closeBlock: '100',
  runtimeOnly: false,
};

const snapshot = (overrides: Partial<PolkamarktSnapshot>): PolkamarktSnapshot =>
  ({
    network: 'SORA Mainnet',
    collateral: 'KUSD',
    feeAsset: 'XOR',
    currentBlock: '10',
    markets: [market],
    history: [],
    positions: [],
    trades: [],
    claimable: [
      {
        marketId: '7',
        account: 'alice',
        status: 'resolved',
        yesShares: '0',
        noShares: '0',
        netCollateralPaid: '0',
        traderPayout: '1000000000000000000',
        creatorFees: '0',
        isCreator: false,
      },
    ],
    capabilities: {
      browse: true,
      quoteBuy: true,
      quoteSell: true,
      marketState: true,
      buy: false,
      sell: false,
      claimMarket: false,
      claimCreatorFees: false,
      reasons: [],
    },
    account: { address: 'alice', signable: true, hasKusd: true, hasXorForFees: true },
    indexerStale: false,
    warnings: [],
    actionsPaused: true,
    ...overrides,
  }) as PolkamarktSnapshot;

const mountPolkamarkt = async (response: PolkamarktSnapshot, marketId = '') => {
  route.params = marketId ? { marketId } : {};
  mocks.snapshot.mockResolvedValue(response);
  const wrapper = mount(PolkamarktPage, { global: { stubs } });
  await flushPromises();

  return wrapper;
};

describe('DeFi screens paused by the release policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.accounts.showPolkaswapAlert = false;
    route.query = {};
    route.params = {};
  });

  describe('Demeter farming', () => {
    it('stays browse-only with a truthful paused notice instead of failing at submit', async () => {
      const wrapper = await mountFarming(catalog({ actionsPaused: true }));

      const notice = wrapper.get('[data-testid="farmingPaused"]');
      expect(notice.attributes('role')).toBe('status');
      expect(notice.text()).toContain('farmingPage.pausedTitle');
      expect(notice.text()).toContain('farmingPage.pausedBody');
      expect(wrapper.find('.signing-state').exists()).toBe(false);
      // Positions and pools stay visible; no action can be started.
      expect(wrapper.findAll('[data-position-key]')).toHaveLength(1);
      expect(actionButtons(wrapper).every(({ disabled }) => disabled)).toBe(true);
      expect(wrapper.find('.popup').exists()).toBe(false);
      expect(mocks.mutateDemeter).not.toHaveBeenCalled();

      await wrapper.get('[data-testid="farmingOpenPools"]').trigger('click');
      expect(mocks.push).toHaveBeenCalledWith({ name: 'Pools' });
      wrapper.unmount();
    });

    it('keeps actions available when the capability is on', async () => {
      const wrapper = await mountFarming(catalog({ actionsPaused: false }));

      expect(wrapper.find('[data-testid="farmingPaused"]').exists()).toBe(false);
      // The position card (deposit, withdraw, claim), then both active pools (deposit).
      expect(actionButtons(wrapper)).toEqual([
        { label: 'farmingPage.deposit', disabled: false },
        { label: 'farmingPage.withdraw', disabled: false },
        { label: 'farmingPage.claim', disabled: false },
        { label: 'farmingPage.deposit', disabled: false },
        { label: 'farmingPage.deposit', disabled: false },
      ]);
      wrapper.unmount();
    });

    it('still explains a watch-only wallet when nothing is paused', async () => {
      const wrapper = await mountFarming(catalog({ actionsPaused: false, canSign: false }));

      expect(wrapper.find('[data-testid="farmingPaused"]').exists()).toBe(false);
      expect(wrapper.get('.signing-state').text()).toContain('farmingPage.browseOnly');
      expect(actionButtons(wrapper).every(({ disabled }) => disabled)).toBe(true);
      wrapper.unmount();
    });
  });

  describe('Polkamarkt', () => {
    it('says trading is paused instead of reporting unavailable market data', async () => {
      const wrapper = await mountPolkamarkt(snapshot({}));

      const notice = wrapper.get('[data-testid="polkamarkt-paused"]');
      expect(notice.text()).toContain('polkamarktPage.pausedTitle');
      expect(notice.text()).toContain('polkamarktPage.pausedBody');
      expect(wrapper.find('[data-testid="polkamarkt-capability-state"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('polkamarktPage.fallback.dataError');
      expect(wrapper.find('[data-testid="polkamarkt-market-7"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('gives the paused reason for trading and claims on a market', async () => {
      const wrapper = await mountPolkamarkt(snapshot({}), '7');

      expect(wrapper.get('.trade-ticket .inline-reason').text()).toBe('polkamarktPage.actionReason.paused');
      expect(wrapper.text()).not.toContain('polkamarktPage.fallback.capability');
      expect(wrapper.get('.trade-ticket button.primary').attributes('disabled')).toBeDefined();

      const claims = wrapper.get('.claim-card');
      expect(claims.get('.inline-reason').text()).toBe('polkamarktPage.actionReason.paused');
      expect(claims.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true);
      wrapper.unmount();
    });

    it('does not ask for the trading disclaimer while trading is paused', async () => {
      mocks.accounts.showPolkaswapAlert = true;
      const wrapper = await mountPolkamarkt(snapshot({ actionsPaused: true }), '7');

      expect(wrapper.find('[data-testid="polkamarkt-paused"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="polkamarkt-disclaimer-gate"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('polkamarktPage.risk.agreement');
      // The paused reason wins over the disclaimer reason, and no consent is recorded from here.
      expect(wrapper.get('.trade-ticket .inline-reason').text()).toBe('polkamarktPage.actionReason.paused');
      expect(mocks.accounts.hidePolkaswapAlert).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it('asks for the trading disclaimer once trading is live', async () => {
      mocks.accounts.showPolkaswapAlert = true;
      const wrapper = await mountPolkamarkt(
        snapshot({
          actionsPaused: false,
          capabilities: { ...snapshot({}).capabilities, buy: true, sell: true, claimMarket: true },
        })
      );

      const gate = wrapper.get('[data-testid="polkamarkt-disclaimer-gate"]');
      await gate.get('input[type="checkbox"]').setValue(true);
      await gate.get('button').trigger('click');
      expect(mocks.accounts.hidePolkaswapAlert).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });

    it('still reports a real data problem when nothing is paused', async () => {
      const wrapper = await mountPolkamarkt(
        snapshot({
          actionsPaused: false,
          warnings: ['Polkamarkt indexer is unavailable.'],
          capabilities: { ...snapshot({}).capabilities, buy: true, sell: true, claimMarket: true },
        })
      );

      expect(wrapper.find('[data-testid="polkamarkt-paused"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="polkamarkt-capability-state"]').text()).toContain(
        'polkamarktPage.fallback.dataError'
      );
      wrapper.unmount();
    });
  });
});
