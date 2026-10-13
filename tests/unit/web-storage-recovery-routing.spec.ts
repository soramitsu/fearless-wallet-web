import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({ hasMasterPassword: true, onboarding: vi.fn() }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false, IS_PRODUCTION: true, IS_TEST_ONLY: false }));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({
  Components: { Wallet: 'Wallet', StorageRecovery: 'StorageRecovery', Welcome: 'Welcome', Unlock: 'Unlock' },
  default: ['Wallet', 'StorageRecovery', 'Welcome', 'Unlock'].map(name => ({ name, path: '/' + name.toLowerCase(), component: {} })),
}));
vi.mock('@/extension/messaging', () => ({
  getAccessStatus: async () => ({ storageRecoveryOnly: true, hasMasterPassword: fixture.hasMasterPassword, issues: [] }),
  isOnboardingRequired: fixture.onboarding,
  keyringIsLocked: async () => fixture.hasMasterPassword,
  hasMasterPassword: async () => fixture.hasMasterPassword,
  hasAccounts: async () => true,
  isNeedMigration: async () => !fixture.hasMasterPassword,
}));
vi.mock('@/router/legacyExposureGuard', () => ({ readLegacyExposureState: vi.fn(), resolveLegacyExposureRedirect: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ selectedWallet: { address: '' } }) }));

import router from '@/router';

beforeEach(() => {
  fixture.onboarding.mockReset().mockRejectedValue(new Error('Wallet storage needs repair.'));
});

describe('web recovery-only startup routing', () => {
  it.each([true, false])('reaches encrypted exports before onboarding or password setup (master password: %s)', async hasMasterPassword => {
    fixture.hasMasterPassword = hasMasterPassword;
    await router.push('/wallet?master=' + hasMasterPassword).catch(() => {});
    expect(router.currentRoute.value.name).toBe('StorageRecovery');
    expect(fixture.onboarding).not.toHaveBeenCalled();
  });
});
