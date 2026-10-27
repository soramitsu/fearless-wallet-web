import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigationGuard } from 'vue-router';

const mocks = vi.hoisted(() => ({
  accounts: {
    accounts: [
      { address: 'old', active: true },
      { address: 'fresh', walletSecurityGeneration: 1 },
    ],
    selectedWallet: { address: 'old' },
  },
  extension: { authRequests: [] as object[], signRequests: [] as object[], metaRequests: [] as object[] },
}));
vi.mock('@/consts/global', async (original) => ({
  ...(await original<typeof import('@/consts/global')>()), IS_EXTENSION: true,
}));
vi.mock('@/bootstrap/accountsReady', () => ({ initialAccountsReady: Promise.resolve() }));
vi.mock('@/router/helpers', () => ({
  getStakingNetwork: vi.fn(), hasSelectedWallet: vi.fn(),
  haveAuthRequests: (store: typeof mocks.extension) => store.authRequests.length,
  haveSignRequests: (store: typeof mocks.extension) => store.signRequests.length,
  haveMetaRequests: (store: typeof mocks.extension) => store.metaRequests.length,
}));
vi.mock('@/extension/messaging', () => ({ keyringIsLocked: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.accounts }));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.extension }));
vi.mock('@/stores/staking', () => ({ useStakingStore: vi.fn() }));
vi.mock('@/screens/welcome/Unlock.vue', () => ({ default: {} }));
vi.mock('@/screens/welcome/Welcome.vue', () => ({ default: {} }));
vi.mock('@/screens/main/Main.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/asset/Asset.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Wallet.vue', () => ({ default: {} }));
vi.mock('@/screens/accounts/AccountsLayout.vue', () => ({ default: {} }));
vi.mock('@/screens/extension-ui/DAppsAuths.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Currencies.vue', () => ({ default: {} }));

import routes from '@/router/routes';

async function openPortfolio() {
  const route = routes.find(({ path }) => path === '/fearless')!.children!.find(({ name }) => name === 'Wallet')!;
  const next = vi.fn();
  await (route.beforeEnter as NavigationGuard).call(undefined, {} as never, {} as never, next);
  return next;
}

beforeEach(() => {
  mocks.accounts.selectedWallet.address = 'old';
  mocks.extension.authRequests = [];
  mocks.extension.signRequests = [];
  mocks.extension.metaRequests = [];
});

describe('pending requests when opening the portfolio', () => {
  it('shows Polkaswap approval without first switching away from an old wallet', async () => {
    mocks.extension.authRequests = [{ id: 'polkaswap', url: 'https://polkaswap.io/' }];
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith({ name: 'Authorize' });
    expect(mocks.accounts.selectedWallet.address).toBe('old');
  });

  it('keeps recovery-only signing requests out of normal-use screens', async () => {
    mocks.extension.signRequests = [{ id: 'sign' }];
    mocks.extension.metaRequests = [{ id: 'metadata' }];
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith();
  });

  it('continues routing a fresh wallet to its signing request', async () => {
    mocks.accounts.selectedWallet.address = 'fresh';
    mocks.extension.signRequests = [{ id: 'sign' }];
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith({ name: 'Transaction' });
  });

  it('keeps the ordinary portfolio available when no request is pending', async () => {
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith();
  });
});
