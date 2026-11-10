import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';

const mocks = vi.hoisted(() => ({
  store: { accounts: [] as AccountJson[], assetPreferencesForAllAccounts: {} },
  getTotalBalances: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.store }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [] }) }));
// Only the second wallet hides an asset.
vi.mock('@/portfolio/usePortfolioPreferences', () => ({
  hiddenKeysForWallet: (address: string) => (address === 'public-wallet-b' ? ['public-hidden-asset'] : []),
}));
vi.mock('@/extension/messaging', () => ({ getTotalBalances: mocks.getTotalBalances, updateCurrentAccount: vi.fn() }));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome' } }));

import SelectWalletPopup from '@/screens/main/SelectWalletPopup.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';

const wallets = ['a', 'b', 'c', 'd'].map((letter): AccountJson => ({
  address: `public-wallet-${letter}`,
  ethereumAddress: '',
  name: `Wallet ${letter.toUpperCase()}`,
  walletEcosystem: WalletEcosystem.Substrate,
}));
const totals = wallets.map(({ address }, index) => ({ address, total: String(index + 1), change: { amount: '0', percent: '0' } }));
const stubs = { FCorners: { template: '<div><slot /></div>' }, Icon: true, WalletBalance: true };

let mounted: VueWrapper[] = [];
const mountRow = (address: string) => {
  const row = mount(WalletInfo, { props: { name: address, address }, global: { mocks: { $t: (key: string) => key }, stubs } });
  mounted.push(row);
  return row;
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.store = reactive({ accounts: [...wallets], assetPreferencesForAllAccounts: {} });
  mocks.getTotalBalances.mockReset().mockResolvedValue(totals);
});

afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount());
  mounted = [];
  vi.useRealTimers();
});

describe('wallet list totals', () => {
  it('asks once per refresh for every row of the wallet list, hidden assets of each wallet included', async () => {
    const selector = mount(SelectWalletPopup, {
      global: {
        mocks: { $t: (key: string) => key },
        stubs: { ...stubs, Popup: { template: '<div><slot /></div>' }, BorderButton: true, PortfolioScopeRow: true },
      },
    });
    mounted.push(selector);
    await flushPromises();

    // The first row asks at once; one more request covers the rows that opened with it.
    expect(mocks.getTotalBalances.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mocks.getTotalBalances).toHaveBeenLastCalledWith({ hiddenKeysByAddress: { 'public-wallet-b': ['public-hidden-asset'] } });
    expect(selector.findAll('wallet-balance-stub').map((balance) => balance.attributes('balance'))).toEqual(['1', '2', '3', '4']);

    mocks.getTotalBalances.mockClear();
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.getTotalBalances).toHaveBeenCalledTimes(3);
  });

  it('sends no request while one is still unanswered', async () => {
    let answer!: (value: typeof totals) => void;
    mocks.getTotalBalances.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    mountRow('public-wallet-a');
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.getTotalBalances).toHaveBeenCalledOnce();

    answer(totals);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.getTotalBalances).toHaveBeenCalledTimes(2);
  });

  it('stops polling when the last row closes, even before the first answer', async () => {
    let answer!: (value: typeof totals) => void;
    mocks.getTotalBalances.mockReturnValueOnce(new Promise((resolve) => { answer = resolve; }));
    const row = mountRow('public-wallet-a');
    await flushPromises();
    expect(mocks.getTotalBalances).toHaveBeenCalledOnce();

    row.unmount();
    mounted = [];
    answer(totals);
    await vi.advanceTimersByTimeAsync(15000);
    expect(mocks.getTotalBalances).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps refreshing the rows still open', async () => {
    const first = mountRow('public-wallet-a');
    const second = mountRow('public-wallet-b');
    await flushPromises();
    first.unmount();
    mounted = [second];

    mocks.getTotalBalances.mockClear().mockResolvedValue(totals.map((total) => ({ ...total, total: '9' })));
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.getTotalBalances).toHaveBeenCalledExactlyOnceWith({ hiddenKeysByAddress: { 'public-wallet-b': ['public-hidden-asset'] } });
    expect(second.get('wallet-balance-stub').attributes('balance')).toBe('9');
  });
});
