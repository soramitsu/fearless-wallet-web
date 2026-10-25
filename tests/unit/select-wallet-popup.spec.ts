import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountJson } from '@extension-base/background/types/types';
import { WalletEcosystem } from '@/interfaces';
import SelectWalletPopup from '@/screens/main/SelectWalletPopup.vue';

const mocks = vi.hoisted(() => ({
  store: { accounts: [] as AccountJson[] },
  updateCurrentAccount: vi.fn(),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.store }));
vi.mock('@/screens/main/walletTotals', () => ({
  fetchWalletTotals: async () => [],
  walletBalanceCaption: () => '',
}));
vi.mock('@/extension/messaging', () => ({
  getTotalBalances: async () => [],
  updateCurrentAccount: mocks.updateCurrentAccount,
}));
vi.mock('@/router/routes', () => ({ Components: { Welcome: 'Welcome' } }));

const evmAddress = `0x${'ab'.repeat(20)}`;
const standalone = (walletEcosystem = WalletEcosystem.Evm): AccountJson => ({
  address: evmAddress,
  ethereumAddress: evmAddress,
  name: 'Standalone EVM',
  type: 'ethereum',
  walletEcosystem,
});
const parent: AccountJson = {
  address: '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q',
  ethereumAddress: `0x${'cd'.repeat(20)}`,
  name: 'Z linked EVM parent',
  walletEcosystem: WalletEcosystem.Substrate,
};
const ton: AccountJson = {
  address: 'UQDxAUFadQXDd3EXGa3TLF_EF66gMc9h3_aZ0j0zXNoIYUCc',
  ethereumAddress: '',
  name: 'A TON wallet',
  walletEcosystem: WalletEcosystem.Ton,
};

let wrapper: VueWrapper;
function mountSelector() {
  wrapper = mount(SelectWalletPopup, {
    global: {
      mocks: { $t: (key: string) => key },
      stubs: {
        Popup: { template: '<div><slot /></div>' },
        FCorners: { template: '<div><slot /></div>' },
        BorderButton: true,
        Icon: true,
        WalletBalance: true,
        PortfolioScopeRow: true,
      },
    },
  });
  return wrapper;
}

beforeEach(() => {
  mocks.store = reactive({ accounts: [] as AccountJson[] });
  mocks.updateCurrentAccount.mockReset().mockResolvedValue(true);
});
afterEach(() => { wrapper?.unmount(); });

describe('selectable wallets', () => {
  it.each([WalletEcosystem.Evm, WalletEcosystem.Substrate])(
    'excludes standalone Ethereum addresses with %s metadata without removing their records', async (ecosystem) => {
      const account = standalone(ecosystem);
      mocks.store.accounts = [account];
      const selector = mountSelector();
      await flushPromises();

      expect(selector.findAll('[data-testid="walletContent"]')).toHaveLength(0);
      expect(mocks.updateCurrentAccount).not.toHaveBeenCalled();
      expect(mocks.store.accounts).toEqual([account]);
    }
  );

  it('filters subscription updates while keeping linked parents and TON wallets selectable in name order', async () => {
    const selector = mountSelector();
    const accounts = [parent, standalone(), ton];
    mocks.store.accounts = accounts;
    await flushPromises();

    const choices = selector.findAll('[data-testid="content"]');
    expect(choices.map((choice) => choice.attributes('aria-label'))).toEqual([ton.name, parent.name]);
    expect(mocks.store.accounts).toEqual(accounts);

    await choices[1].trigger('click');
    await flushPromises();
    expect(mocks.updateCurrentAccount).toHaveBeenLastCalledWith(parent.address, WalletEcosystem.Substrate);
    expect(selector.emitted('close')).toHaveLength(1);

    await choices[0].trigger('click');
    await flushPromises();
    expect(mocks.updateCurrentAccount).toHaveBeenLastCalledWith(ton.address, WalletEcosystem.Ton);
    expect(selector.emitted('close')).toHaveLength(2);
  });
});
