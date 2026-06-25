import type { UniversalWalletMigrationRequiredAction } from '@/util/universalWalletMigrationContract';

const UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES = {
  AddWallet: 'AddWallet',
  ChangePassword: 'ChangePassword',
  Export: 'Export',
  MigrationAccounts: 'MigrationAccounts',
  MigrationDescription: 'MigrationDescription',
  Onboarding: 'Onboarding',
  ResetWallet: 'ResetWallet',
  Unlock: 'Unlock',
  UniversalWalletMigration: 'UniversalWalletMigration',
  Wallet: 'Wallet',
  Welcome: 'Welcome',
} as const;

const UNIVERSAL_WALLET_MIGRATION_BASE_ALLOWED_ROUTES = new Set<string>([
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.AddWallet,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.ChangePassword,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.MigrationAccounts,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.MigrationDescription,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.Onboarding,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.ResetWallet,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.Unlock,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.UniversalWalletMigration,
]);

const UNIVERSAL_WALLET_MIGRATION_WITH_EXPORT_ROUTES = new Set<string>([
  ...UNIVERSAL_WALLET_MIGRATION_BASE_ALLOWED_ROUTES,
  UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.Export,
]);

type UniversalWalletMigrationRedirectInput = {
  action: UniversalWalletMigrationRequiredAction;
  routeName: string | symbol | null | undefined;
};

function resolveUniversalWalletMigrationRedirect({
  action,
  routeName,
}: UniversalWalletMigrationRedirectInput): string | null {
  const normalizedRouteName = typeof routeName === 'string' ? routeName : '';

  if (action === 'normal-access') {
    return normalizedRouteName === UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.UniversalWalletMigration
      ? UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.Welcome
      : null;
  }

  const allowedRoutes =
    action === 'migrate-before-access'
      ? UNIVERSAL_WALLET_MIGRATION_WITH_EXPORT_ROUTES
      : UNIVERSAL_WALLET_MIGRATION_BASE_ALLOWED_ROUTES;

  return allowedRoutes.has(normalizedRouteName)
    ? null
    : UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES.UniversalWalletMigration;
}

export { UNIVERSAL_WALLET_MIGRATION_ROUTE_NAMES, resolveUniversalWalletMigrationRedirect };
export type { UniversalWalletMigrationRedirectInput };
