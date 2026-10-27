import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  beforeEach: vi.fn(),
  status: vi.fn(),
  locked: vi.fn(),
  migration: vi.fn(),
  onboarding: vi.fn(),
}));
vi.mock('vue-router', () => ({
  createWebHashHistory: vi.fn(),
  createRouter: () => ({ beforeEach: mocks.beforeEach, back: vi.fn() }),
}));
vi.mock('@/router/helpers', () => ({ updateTitle: vi.fn() }));
vi.mock('@/router/routes', () => ({
  default: [],
  Components: Object.fromEntries(
    ['Onboarding', 'MigrationDescription', 'MigrationAccounts', 'ChangePassword', 'Welcome', 'Unlock', 'ResetWallet', 'Wallet'].map(
      (name) => [name, name]
    )
  ),
}));
vi.mock('@/extension/messaging', () => ({
  keyringIsLocked: mocks.locked,
  hasMasterPassword: async () => true,
  hasAccounts: async () => true,
  isNeedMigration: mocks.migration,
  getAccessStatus: async () => ({ storageRecoveryOnly: false, issues: [] }),
  isOnboardingRequired: mocks.onboarding,
}));
vi.mock('@/extension/messaging/legacy-exposure', () => ({ getLegacyExposureStatus: mocks.status }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false, IS_PRODUCTION: true, IS_TEST_ONLY: false }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

type Guard = (to: { name: string; fullPath: string }, from: { name?: string }, next: (target?: unknown) => void) => Promise<void>;

async function navigate(name: string, fullPath = `/${name}`, from: { name?: string } = {}) {
  await import('@/router');
  const guard = mocks.beforeEach.mock.calls[0][0] as Guard;
  const next = vi.fn();

  await guard({ name, fullPath }, from, next);

  return next;
}

const status = (state: string) => ({ state, wallets: [], newWallets: [] });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.locked.mockResolvedValue(false);
  mocks.migration.mockResolvedValue(false);
  mocks.onboarding.mockResolvedValue(false);
  mocks.status.mockResolvedValue(status('not_exposed'));
});

describe('the security notice after an update from 3.0.x', () => {
  it.each(['Wallet', 'SendForm', 'Transaction', 'Authorize', 'Settings', 'AddWallet', 'ResetWallet', 'SecurityNoticeGuide'])(
    'comes before %s once the wallet is unlocked, and remembers where the user was going',
    async (name) => {
      mocks.status.mockResolvedValue(status('notice_pending'));

      const next = await navigate(name, `/${name}?x=1`);

      expect(next).toHaveBeenCalledExactlyOnceWith({ name: 'SecurityNotice', query: { redirect: `/${name}?x=1` } });
    }
  );

  it('comes before the per-account password prompt of a 2.x profile that 3.0.x upgraded', async () => {
    mocks.status.mockResolvedValue(status('notice_pending'));
    mocks.migration.mockResolvedValue(true);

    expect(await navigate('Wallet')).toHaveBeenCalledExactlyOnceWith({
      name: 'SecurityNotice',
      query: { redirect: '/Wallet' },
    });
    // The notice itself is shown, not sent on to the prompt, which would send it back.
    expect(await navigate('SecurityNotice')).toHaveBeenCalledExactlyOnceWith();
  });

  it('waits for the unlock: a locked wallet goes to Unlock first', async () => {
    mocks.status.mockResolvedValue(status('notice_pending'));
    mocks.locked.mockResolvedValue(true);

    expect(await navigate('Wallet', '/wallet')).toHaveBeenCalledExactlyOnceWith({
      name: 'Unlock',
      query: { redirect: '/wallet' },
    });
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('lets an acknowledged user go anywhere, the notice and the guide included', async () => {
    mocks.status.mockResolvedValue(status('acknowledged'));

    for (const name of ['Wallet', 'SecurityNotice', 'SecurityNoticeGuide']) {
      expect(await navigate(name)).toHaveBeenCalledExactlyOnceWith();
    }
  });

  it('sends a user with nothing to be told away from the notice and the guide', async () => {
    expect(await navigate('SecurityNotice')).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    expect(await navigate('SecurityNoticeGuide')).toHaveBeenCalledExactlyOnceWith({ name: 'Welcome' });
    expect(await navigate('Wallet')).toHaveBeenCalledExactlyOnceWith();
  });

  it('allows an imported-key guide after a fresh profile imports its first key', async () => {
    expect(await navigate('Wallet')).toHaveBeenCalledExactlyOnceWith();
    mocks.status.mockResolvedValue({ ...status('not_exposed'), importedWallets: [{ address: 'imported', present: true }] });

    expect(await navigate('SecurityNoticeGuide')).toHaveBeenCalledExactlyOnceWith();
    expect(await navigate('Wallet')).toHaveBeenCalledExactlyOnceWith();
    expect(await navigate('SecurityNotice')).toHaveBeenCalledExactlyOnceWith({ name: 'SecurityNoticeGuide' });
  });

  it('never keeps the user out of the wallet when the background cannot answer', async () => {
    mocks.status.mockRejectedValue(new Error('Wallet storage could not be read'));

    expect(await navigate('Wallet')).toHaveBeenCalledExactlyOnceWith();
    expect(await navigate('SendForm')).toHaveBeenCalledExactlyOnceWith();
  });

  it('asks again while the record is unknown and stops asking once it is settled', async () => {
    const { forgetLegacyExposureState, readLegacyExposureState } = await import('@/router/legacyExposureGuard');
    forgetLegacyExposureState();
    mocks.status.mockResolvedValueOnce(status('unknown')).mockResolvedValueOnce(status('notice_pending'));
    mocks.status.mockResolvedValue(status('acknowledged'));

    expect(await readLegacyExposureState()).toBe('unknown');
    expect(await readLegacyExposureState()).toBe('notice_pending');
    expect(await readLegacyExposureState()).toBe('acknowledged');
    expect(await readLegacyExposureState()).toBe('acknowledged');
    expect(mocks.status).toHaveBeenCalledTimes(3);
  });

  it('opens the recovery banner\'s guide for an old or imported wallet whatever the exposure record says', async () => {
    const { resolveLegacyExposureRedirect } = await import('@/router/legacyExposureGuard');
    const guide = (state: Parameters<typeof resolveLegacyExposureRedirect>[0]['state'], walletRecoveryOnly: boolean) =>
      resolveLegacyExposureRedirect({ state, routeName: 'SecurityNoticeGuide', fullPath: '/security/guide', walletRecoveryOnly });

    // A profile from before 3.0.1 reads as not exposed, yet its wallets are recovery-only and carry the banner.
    for (const state of ['not_exposed', 'unknown', undefined] as const) {
      expect(guide(state, true)).toBeNull();
      expect(guide(state, false)).toEqual({ name: 'Welcome' });
    }
    // The pending notice still comes first, and the notice itself is not opened for the banner.
    expect(guide('notice_pending', true)).toEqual({ name: 'SecurityNotice', query: { redirect: '/security/guide' } });
    expect(resolveLegacyExposureRedirect({ state: 'not_exposed', routeName: 'SecurityNotice', fullPath: '/security', walletRecoveryOnly: true }))
      .toEqual({ name: 'Welcome' });
  });
});
