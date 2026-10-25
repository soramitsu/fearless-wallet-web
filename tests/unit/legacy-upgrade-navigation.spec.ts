import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beforeEach: vi.fn(), accounts: vi.fn(), locked: vi.fn(), migration: vi.fn(), snapshot: vi.fn(), access: vi.fn(),
  master: vi.fn(),
}));
vi.mock('vue-router', () => ({
  createWebHashHistory: vi.fn(),
  createRouter: () => ({ beforeEach: mocks.beforeEach, back: vi.fn() }),
}));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({
  default: [],
  Components: Object.fromEntries(['Onboarding', 'MigrationDescription', 'MigrationAccounts', 'ChangePassword',
    'Welcome', 'Unlock', 'ResetWallet', 'Wallet', 'AccountAccessRecovery'].map((name) => [name, name])),
}));
vi.mock('@/extension/messaging', () => ({
  keyringIsLocked: mocks.locked,
  hasMasterPassword: mocks.master,
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
  mocks.master.mockResolvedValue(true);
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

  describe('while the per-account password prompt is due', () => {
    beforeEach(() => {
      mocks.migration.mockResolvedValue(true);
    });

    it.each(['Wallet', 'SendForm', 'Settings', 'Export', 'Welcome'])('leads %s to the prompt', async (name) => {
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name, fullPath: `/${name}` }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationDescription' });
    });

    it.each(['MigrationDescription', 'MigrationAccounts'])('opens %s', async (name) => {
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name, fullPath: `/${name}` }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith();
    });

    it('opens the password setup only from the description', async () => {
      await import('@/router');
      const guard = mocks.beforeEach.mock.calls[0][0];
      const fromDescription = vi.fn();
      const direct = vi.fn();
      await guard({ name: 'ChangePassword', fullPath: '/password' }, { name: 'MigrationDescription' }, fromDescription);
      await guard({ name: 'ChangePassword', fullPath: '/password' }, {}, direct);
      expect(fromDescription).toHaveBeenCalledExactlyOnceWith();
      expect(direct).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationDescription' });
    });

    // C17: Settings is out of reach while the prompt is due, so "More options" has to be able to open Reset.
    it('keeps Reset wallet reachable', async () => {
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name: 'ResetWallet', fullPath: '/reset' }, { name: 'MigrationAccounts' }, next);
      expect(next).toHaveBeenCalledExactlyOnceWith();
    });

    it('opens Account access, where one account is unlocked with its recovery phrase', async () => {
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0](
        { name: 'AccountAccessRecovery', fullPath: '/settings/account-access?address=5Grw&mode=phrase' },
        { name: 'MigrationAccounts' },
        next
      );
      expect(next).toHaveBeenCalledExactlyOnceWith();
    });

    // Recovery stores the key under the master password; before it exists the prompt creates it first.
    it('leads Account access back to the prompt while there is no master password yet', async () => {
      mocks.master.mockResolvedValue(false);
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name: 'AccountAccessRecovery', fullPath: '/settings/account-access' }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'MigrationDescription' });
    });

    it('asks a locked wallet for its password first', async () => {
      mocks.locked.mockResolvedValue(true);
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name: 'Wallet', fullPath: '/wallet' }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'Unlock', query: { redirect: '/wallet' } });
    });
  });

  // After "Skip for now" (or "Later") the prompt is no longer due although accounts still wait.
  it.each(['Wallet', 'SendForm', 'ReceiveForm', 'Settings', 'AccountAccessRecovery'])(
    'opens %s after the prompt was skipped while accounts still wait for their passwords',
    async (name) => {
      mocks.access.mockResolvedValue({
        promptPending: false,
        deferred: true,
        issues: [{ address: '5EHgWw2Af1pnoc7f1A8bfmM97W3DAYW8xr82RfhLL9oAabAe', kind: 'legacy_account_password' }],
      });
      await import('@/router');
      const next = vi.fn();
      await mocks.beforeEach.mock.calls[0][0]({ name, fullPath: `/${name}` }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith();
    }
  );

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
