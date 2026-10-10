import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beforeEach: vi.fn(), accounts: vi.fn(), locked: vi.fn(), migration: vi.fn(), snapshot: vi.fn(), access: vi.fn(),
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
  getAccessStatus: mocks.access,
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
  mocks.access.mockResolvedValue({ issues: [] });
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

  // Parent migrated, its EVM account still on its 2.6.3 password: not prompted (as in 3.0.5), but the row
  // stays reachable and can be migrated.
  it('keeps the password rows open while an account still waits for its legacy password', async () => {
    mocks.access.mockResolvedValue({ promptPending: false, issues: [{ address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94', kind: 'legacy_account_password' }] });
    await import('@/router');
    const next = vi.fn();
    await mocks.beforeEach.mock.calls[0][0]({ name: 'MigrationAccounts', fullPath: '/migration-accounts' }, {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    ['no account waits', []],
    ['only a key left under an earlier master password waits', [{ address: 'UQ', kind: 'previous_master_password' }]],
  ])('leaves the password rows when %s', async (_, issues) => {
    mocks.access.mockResolvedValue({ promptPending: false, issues });
    await import('@/router');
    const next = vi.fn();
    await mocks.beforeEach.mock.calls[0][0]({ name: 'MigrationAccounts', fullPath: '/migration-accounts' }, {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
  });
});
