import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beforeEach: vi.fn(), accounts: vi.fn(), locked: vi.fn(), migration: vi.fn(), snapshot: vi.fn(),
}));
vi.mock('vue-router', () => ({
  createWebHashHistory: vi.fn(),
  createRouter: () => ({ beforeEach: mocks.beforeEach, back: vi.fn() }),
}));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({
  default: [],
  Components: Object.fromEntries(['Onboarding', 'MigrationDescription', 'MigrationAccounts', 'ChangePassword',
    'Welcome', 'Unlock', 'ResetWallet', 'Wallet'].map((name) => [name, name])),
}));
vi.mock('@/extension/messaging', () => ({
  keyringIsLocked: mocks.locked,
  hasMasterPassword: async () => true,
  hasAccounts: mocks.accounts,
  isNeedMigration: mocks.migration,
  isOnboardingRequired: async () => false,
  getUniversalWalletMigrationSnapshot: mocks.snapshot,
}));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false, IS_PRODUCTION: true, IS_TEST_ONLY: false }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.accounts.mockResolvedValue(true);
  mocks.locked.mockResolvedValue(false);
  mocks.migration.mockResolvedValue(false);
  mocks.snapshot.mockRejectedValue(new Error('Optional metadata unavailable'));
});

describe('legacy upgrade navigation', () => {
  it.each(['Wallet', 'SendForm', 'ReceiveForm', 'Staking', 'Export', 'Settings'])(
    'keeps %s available without new-network metadata', async (name) => {
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name, fullPath: `/${name}` }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(mocks.snapshot).not.toHaveBeenCalled();
    }
  );

  it('preserves the password gate for a locked legacy wallet', async () => {
    mocks.locked.mockResolvedValue(true);
    await import('@/router');
    const next = vi.fn();
    await mocks.beforeEach.mock.calls[0][0]({ name: 'SendForm', fullPath: '/send' }, {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'Unlock', query: { redirect: '/send' } });
  });

  it('opens onboarding only when no accounts exist', async () => {
    mocks.accounts.mockResolvedValue(false);
    await import('@/router');
    const next = vi.fn();
    await mocks.beforeEach.mock.calls[0][0]({ name: 'Wallet', fullPath: '/wallet' }, {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'UniversalWalletMigration' });
  });
});
