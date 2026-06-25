import {
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES as Routes,
  resolveUniversalWalletMigrationRedirect,
} from '@/router/universalWalletMigrationGuard';

describe('Universal Wallet migration route guard', () => {
  it('redirects normal wallet routes to the hard-cutoff screen before a universal wallet exists', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: Routes.Wallet,
      })
    ).toBe(Routes.UniversalWalletMigration);
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'create-universal-wallet',
        routeName: Routes.Welcome,
      })
    ).toBe(Routes.UniversalWalletMigration);
  });

  it('allows only wallet creation, export, password, lock, reset, onboarding, and migration routes during cutoff', () => {
    for (const routeName of [
      Routes.AddWallet,
      Routes.ChangePassword,
      Routes.Export,
      Routes.MigrationAccounts,
      Routes.MigrationDescription,
      Routes.Onboarding,
      Routes.ResetWallet,
      Routes.Unlock,
      Routes.UniversalWalletMigration,
    ]) {
      expect(
        resolveUniversalWalletMigrationRedirect({
          action: 'migrate-before-access',
          routeName,
        })
      ).toBeNull();
    }
  });

  it('allows export only when legacy vault migration is required', () => {
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

  it('prevents the hard-cutoff screen from lingering after normal access is allowed', () => {
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

  it('treats unknown or symbol route names as unsafe while cutoff is active', () => {
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: Symbol('unsafe'),
      })
    ).toBe(Routes.UniversalWalletMigration);
    expect(
      resolveUniversalWalletMigrationRedirect({
        action: 'migrate-before-access',
        routeName: undefined,
      })
    ).toBe(Routes.UniversalWalletMigration);
  });
});
