import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  allowsLegacySecretExport,
  allowsUniversalWalletNormalAccess,
  getUniversalWalletMigrationRequiredAction,
  validateUniversalWalletMigrationSnapshot,
  type UniversalWalletLegacyVaultDescriptor,
  type UniversalWalletMigrationSnapshot,
} from '@/util/universalWalletMigrationContract';

describe('Universal Wallet migration contract', () => {
  it('blocks normal access when legacy vaults exist without a universal wallet', () => {
    const snapshot = migrationSnapshot({ hasUniversalWallet: false, legacyVaults: [legacyVault()] });

    expect(validateUniversalWalletMigrationSnapshot(snapshot)).toEqual([]);
    expect(getUniversalWalletMigrationRequiredAction(snapshot)).toBe('migrate-before-access');
    expect(allowsUniversalWalletNormalAccess(snapshot)).toBe(false);
    expect(allowsLegacySecretExport(snapshot)).toBe(true);
    expect(JSON.stringify(snapshot)).toContain('"platform":"web"');
    expect(JSON.stringify(snapshot)).toContain('"mode":"export-only"');
    expect(JSON.stringify(snapshot)).toContain('"canSignTransactions":false');
  });

  it('requires a new universal wallet when no wallet material exists', () => {
    const snapshot = migrationSnapshot({ hasUniversalWallet: false, legacyVaults: [] });

    expect(validateUniversalWalletMigrationSnapshot(snapshot)).toEqual([]);
    expect(getUniversalWalletMigrationRequiredAction(snapshot)).toBe('create-universal-wallet');
    expect(allowsUniversalWalletNormalAccess(snapshot)).toBe(false);
    expect(allowsLegacySecretExport(snapshot)).toBe(false);
  });

  it('allows normal access once a universal wallet exists while keeping legacy export-only', () => {
    const snapshot = migrationSnapshot({ hasUniversalWallet: true, legacyVaults: [legacyVault()] });

    expect(validateUniversalWalletMigrationSnapshot(snapshot)).toEqual([]);
    expect(getUniversalWalletMigrationRequiredAction(snapshot)).toBe('normal-access');
    expect(allowsUniversalWalletNormalAccess(snapshot)).toBe(true);
    expect(allowsLegacySecretExport(snapshot)).toBe(true);
  });

  it('rejects malformed migration snapshots and legacy vaults', () => {
    const badVault = {
      ...legacyVault(),
      accountId: '../bad',
      address: ' address ',
      canExportSecrets: false,
      canSignTransactions: true,
      discoveredAtMillis: 10,
      displayName: 'bad\u0000name',
      ecosystem: 'unknown' as WalletEcosystem,
      exportOnlyReason: ' ',
      lastExportedAtMillis: 9,
      vaultId: 'bad',
    };
    const snapshot = migrationSnapshot({
      cutoffAtMillis: 0,
      evaluatedAtMillis: 0,
      legacyVaults: [badVault, badVault],
      schemaVersion: 99,
    });

    expect(validateUniversalWalletMigrationSnapshot(snapshot)).toEqual(
      expect.arrayContaining([
        'invalidSchemaVersion',
        'invalidTimestamp',
        'invalidVaultId',
        'duplicateVaultId',
        'invalidAccountId',
        'invalidEcosystem',
        'invalidAddress',
        'invalidDisplayName',
        'invalidExportReason',
        'exportDisabled',
        'legacySigningEnabled',
      ])
    );
  });
});

function migrationSnapshot(overrides: Partial<UniversalWalletMigrationSnapshot> = {}): UniversalWalletMigrationSnapshot {
  return {
    schemaVersion: UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
    platform: 'web',
    hasUniversalWallet: false,
    legacyVaults: [legacyVault()],
    cutoffAtMillis: 1_710_000_000_000,
    evaluatedAtMillis: 1_710_000_000_100,
    ...overrides,
  };
}

function legacyVault(): UniversalWalletLegacyVaultDescriptor {
  return {
    vaultId: 'legacy_12345678',
    accountId: 'substrate-legacy',
    ecosystem: WalletEcosystem.Substrate,
    address: '15FKRtF6nX3SE4PaW4LX69XqYHq2oSep9JX5KF4cgN1XkZ4q',
    displayName: 'Legacy DOT',
    mode: 'export-only',
    exportOnlyReason: 'pre-cutoff account export',
    canExportSecrets: true,
    canSignTransactions: false,
    discoveredAtMillis: 1_700_000_000_000,
    lastExportedAtMillis: 1_700_000_000_100,
  };
}
