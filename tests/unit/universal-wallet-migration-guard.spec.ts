import {
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES as Routes,
  resolveUniversalWalletMigrationRedirect,
} from '@/router/universalWalletMigrationGuard';

describe('Universal Wallet migration route guard', () => {
  it('keeps legacy wallet routes accessible and reserves onboarding for empty installs', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: Routes.Wallet,
      })
    ).toBeNull();
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'create-universal-wallet',
        routeName: Routes.Welcome,
      })
    ).toBe(Routes.UniversalWalletMigration);
  });

  it('preserves all existing wallet actions for historical migration snapshots', () => {
    for (const routeName of [
      Routes.AddWallet,
      Routes.ChangePassword,
      Routes.Export,
      Routes.MigrationAccounts,
      Routes.MigrationDescription,
      Routes.Onboarding,
      Routes.ResetWallet,
      Routes.Unlock,
      Routes.Wallet,
      'SendForm',
      'ReceiveForm',
      'Staking',
    ]) {
      expect(
        resolveUniversalWalletMigrationRedirect({
          action: 'migrate-before-access',
          routeName,
        })
      ).toBeNull();
    }
  });

  it('keeps legacy export available and avoids export on empty installs', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: Routes.Export,
      })
    ).toBeNull();
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'create-universal-wallet',
        routeName: Routes.Export,
      })
    ).toBe(Routes.UniversalWalletMigration);
  });

  it('leaves the obsolete cutoff screen when normal access is allowed', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'normal-access',
        routeName: Routes.UniversalWalletMigration,
      })
    ).toBe(Routes.Welcome);
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'normal-access',
        routeName: Routes.Wallet,
      })
    ).toBeNull();
  });

  it('leaves unknown legacy routes to the normal router rather than forcing migration', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: Symbol('unsafe'),
      })
    ).toBeNull();
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: undefined,
      })
    ).toBeNull();
  });
});
