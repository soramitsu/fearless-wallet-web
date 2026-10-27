import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beforeEach: vi.fn(), locked: false,
  store: { accounts: [{ address: 'old', active: true, walletSecurityGeneration: undefined as number | undefined }], selectedWallet: { address: 'old' } },
}));
vi.mock('vue-router', () => ({ createWebHashHistory: vi.fn(), createRouter: () => ({ beforeEach: mocks.beforeEach, back: vi.fn() }) }));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({ default: [], Components: Object.fromEntries([
  'Onboarding', 'MigrationDescription', 'MigrationAccounts', 'ChangePassword', 'Welcome', 'Unlock', 'ResetWallet', 'Wallet',
].map((name) => [name, name])) }));
vi.mock('@/bootstrap/accountsReady', () => ({ initialAccountsReady: Promise.resolve() }));
vi.mock('@/extension/messaging/legacy-exposure', () => ({
  getLegacyExposureStatus: async () => ({ state: 'acknowledged', wallets: [] }),
}));
vi.mock('@/extension/messaging', () => ({
  keyringIsLocked: async () => mocks.locked, hasMasterPassword: async () => true, hasAccounts: async () => true,
  isNeedMigration: async () => false, isOnboardingRequired: async () => false,
}));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: true, IS_PRODUCTION: true, IS_TEST_ONLY: false }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => mocks.store }));

beforeEach(() => {
  vi.resetModules();
  mocks.beforeEach.mockClear();
  mocks.locked = false;
  mocks.store.accounts[0].walletSecurityGeneration = undefined;
});

async function navigate(name: string) {
  await import('@/router');
  const next = vi.fn();
  await mocks.beforeEach.mock.calls[0][0]({ name, fullPath: `/${name}` }, {}, next);
  return next;
}

describe('extension recovery navigation', () => {
  it.each(['SendForm', 'NftSendForm', 'Export', 'AddWallet', 'Currencies', 'Settings', 'Defi', 'Staking', 'MyStake', 'Pools', 'PoolDetails', 'Farming', 'Polkamarkt', 'SecurityNotice', 'SecurityNoticeGuide'])(
    'allows %s for an old wallet', async (name) => { expect(await navigate(name)).toHaveBeenCalledExactlyOnceWith(); }
  );

  it.each(['ReceiveForm', 'Polkaswap', 'CrossChainForm', 'Transaction', 'WalletConnectSignConfirmation'])(
    'redirects %s to recovery instead of unlocking normal use', async (name) => {
      expect(await navigate(name)).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet', query: { security: 'recovery-only' } });
    }
  );

  it('allows connection approval while a recovery-only wallet is selected', async () => {
    expect(await navigate('Authorize')).toHaveBeenCalledExactlyOnceWith();
  });

  it('requires unlock before showing connection approval', async () => {
    mocks.locked = true;
    expect(await navigate('Authorize')).toHaveBeenCalledExactlyOnceWith({ name: 'Unlock', query: { redirect: '/Authorize' } });
  });

  it('allows normal use only after a fresh wallet is selected', async () => {
    mocks.store.accounts[0].walletSecurityGeneration = 1;
    expect(await navigate('Polkaswap')).toHaveBeenCalledExactlyOnceWith();
  });

  it('keeps the password gate ahead of recovery navigation', async () => {
    mocks.locked = true;
    expect(await navigate('Staking')).toHaveBeenCalledExactlyOnceWith({ name: 'Unlock', query: { redirect: '/Staking' } });
  });
});
