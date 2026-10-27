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
  extension: {
    authRequests: [] as object[], signRequests: [] as object[], metaRequests: [] as object[],
    signEvmRequests: {} as Record<string, object>, signSolanaRequests: {} as Record<string, object>,
  },
}));
vi.mock('@/consts/global', async (original) => ({
  ...(await original<typeof import('@/consts/global')>()), IS_EXTENSION: true,
}));
vi.mock('@/bootstrap/accountsReady', () => ({ initialAccountsReady: Promise.resolve() }));
// Keep the real queue helpers: all three signing protocols must reach the same approval route.
vi.mock('@/helpers/only-web', () => ({ setTitle: vi.fn() }));
vi.mock('@/locales', () => ({ i18n: {} }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: true }));
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
  mocks.extension.signEvmRequests = {};
  mocks.extension.signSolanaRequests = {};
  mocks.extension.metaRequests = [];
});

describe('pending requests when opening the portfolio', () => {
  it('shows Polkaswap approval without first switching away from an old wallet', async () => {
    mocks.extension.authRequests = [{ id: 'polkaswap', url: 'https://polkaswap.io/' }];
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith({ name: 'Authorize' });
    expect(mocks.accounts.selectedWallet.address).toBe('old');
  });

  it('keeps metadata updates out of recovery-only portfolio screens', async () => {
    mocks.extension.metaRequests = [{ id: 'metadata' }];
    expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith();
  });

  it.each(['substrate', 'mobile', 'external', 'evm', 'solana'])(
    'opens a pending %s request without changing the selected recovery-only wallet', async (kind) => {
      const request = { id: 'sign', account: { address: 'fresh', isMobile: kind === 'mobile', isExternal: kind === 'external' } };
      if (kind === 'evm') mocks.extension.signEvmRequests = { sign: request };
      else if (kind === 'solana') mocks.extension.signSolanaRequests = { sign: request };
      else mocks.extension.signRequests = [request];

      expect(await openPortfolio()).toHaveBeenCalledExactlyOnceWith({ name: 'Transaction' });
      const signingRoute = routes.find(({ name }) => name === 'Transaction')!;
      const next = vi.fn();
      await (signingRoute.beforeEnter as NavigationGuard).call(undefined, {} as never, {} as never, next);
      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.accounts.selectedWallet.address).toBe('old');
    }
  );

  it('returns to the portfolio when the signing queue has already been settled elsewhere', async () => {
    const signingRoute = routes.find(({ name }) => name === 'Transaction')!;
    const next = vi.fn();
    await (signingRoute.beforeEnter as NavigationGuard).call(undefined, {} as never, {} as never, next);
    expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
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
