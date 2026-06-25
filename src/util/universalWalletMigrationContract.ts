import { WalletEcosystem } from '@/interfaces';

const UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION = 1;
const UNIVERSAL_WALLET_MIGRATION_PLATFORMS = ['android', 'ios', 'web'] as const;
const UNIVERSAL_WALLET_MIGRATION_REQUIRED_ACTIONS = [
  'normal-access',
  'create-universal-wallet',
  'migrate-before-access',
] as const;
const UNIVERSAL_WALLET_LEGACY_VAULT_MODES = ['export-only'] as const;

type UniversalWalletMigrationPlatform = (typeof UNIVERSAL_WALLET_MIGRATION_PLATFORMS)[number];
type UniversalWalletMigrationRequiredAction = (typeof UNIVERSAL_WALLET_MIGRATION_REQUIRED_ACTIONS)[number];
type UniversalWalletLegacyVaultMode = (typeof UNIVERSAL_WALLET_LEGACY_VAULT_MODES)[number];

type UniversalWalletMigrationValidationError =
  | 'invalidSchemaVersion'
  | 'invalidVaultId'
  | 'duplicateVaultId'
  | 'invalidAccountId'
  | 'invalidEcosystem'
  | 'invalidAddress'
  | 'invalidDisplayName'
  | 'invalidLegacyMode'
  | 'invalidExportReason'
  | 'exportDisabled'
  | 'legacySigningEnabled'
  | 'invalidTimestamp';

type UniversalWalletLegacyVaultDescriptor = {
  vaultId: string;
  accountId: string;
  ecosystem: WalletEcosystem;
  address: string;
  displayName?: string;
  mode: UniversalWalletLegacyVaultMode;
  exportOnlyReason: string;
  canExportSecrets: boolean;
  canSignTransactions: boolean;
  discoveredAtMillis: number;
  lastExportedAtMillis?: number;
};

type UniversalWalletMigrationSnapshot = {
  schemaVersion: number;
  platform: UniversalWalletMigrationPlatform;
  hasUniversalWallet: boolean;
  legacyVaults: UniversalWalletLegacyVaultDescriptor[];
  cutoffAtMillis: number;
  evaluatedAtMillis: number;
};

function getUniversalWalletMigrationRequiredAction(
  snapshot: UniversalWalletMigrationSnapshot
): UniversalWalletMigrationRequiredAction {
  if (snapshot.hasUniversalWallet) return 'normal-access';

  return snapshot.legacyVaults.length ? 'migrate-before-access' : 'create-universal-wallet';
}

function allowsUniversalWalletNormalAccess(snapshot: UniversalWalletMigrationSnapshot): boolean {
  return getUniversalWalletMigrationRequiredAction(snapshot) === 'normal-access';
}

function allowsLegacySecretExport(snapshot: UniversalWalletMigrationSnapshot): boolean {
  return snapshot.legacyVaults.some(({ canExportSecrets }) => canExportSecrets);
}

function validateUniversalWalletMigrationSnapshot(
  snapshot: UniversalWalletMigrationSnapshot
): UniversalWalletMigrationValidationError[] {
  const errors = new Set<UniversalWalletMigrationValidationError>();

  if (snapshot.schemaVersion !== UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION) errors.add('invalidSchemaVersion');
  if (!isPositiveSafeInteger(snapshot.cutoffAtMillis) || !isPositiveSafeInteger(snapshot.evaluatedAtMillis)) {
    errors.add('invalidTimestamp');
  }

  const vaultIds = new Set<string>();
  for (const vault of snapshot.legacyVaults) {
    validateUniversalWalletLegacyVaultDescriptor(vault).forEach((error) => errors.add(error));
    if (vaultIds.has(vault.vaultId)) errors.add('duplicateVaultId');
    vaultIds.add(vault.vaultId);
  }

  return [...errors];
}

function validateUniversalWalletLegacyVaultDescriptor(
  vault: UniversalWalletLegacyVaultDescriptor
): UniversalWalletMigrationValidationError[] {
  const errors = new Set<UniversalWalletMigrationValidationError>();

  if (!/^legacy_[A-Za-z0-9_-]{8,64}$/.test(vault.vaultId)) errors.add('invalidVaultId');
  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(vault.accountId)) errors.add('invalidAccountId');
  if (!(Object.values(WalletEcosystem) as string[]).includes(vault.ecosystem)) errors.add('invalidEcosystem');
  if (!isMachineText(vault.address, 256)) errors.add('invalidAddress');
  if (vault.displayName !== undefined && !isHumanText(vault.displayName, 64)) errors.add('invalidDisplayName');
  if (vault.mode !== 'export-only') errors.add('invalidLegacyMode');
  if (!isHumanText(vault.exportOnlyReason, 160)) errors.add('invalidExportReason');
  if (!vault.canExportSecrets) errors.add('exportDisabled');
  if (vault.canSignTransactions) errors.add('legacySigningEnabled');
  if (
    !isPositiveSafeInteger(vault.discoveredAtMillis) ||
    (vault.lastExportedAtMillis !== undefined &&
      (!Number.isSafeInteger(vault.lastExportedAtMillis) || vault.lastExportedAtMillis < vault.discoveredAtMillis))
  ) {
    errors.add('invalidTimestamp');
  }

  return [...errors];
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isHumanText(value: string, maxLength: number): boolean {
  const normalized = value.trim();
  return !!normalized && normalized.length <= maxLength && !hasControlCharacters(normalized);
}

function isMachineText(value: string, maxLength: number): boolean {
  return !!value && value.length <= maxLength && value === value.trim() && !hasWhitespaceOrControl(value);
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function hasWhitespaceOrControl(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x20 || codePoint === 0x7f;
  });
}

export {
  UNIVERSAL_WALLET_LEGACY_VAULT_MODES,
  UNIVERSAL_WALLET_MIGRATION_PLATFORMS,
  UNIVERSAL_WALLET_MIGRATION_REQUIRED_ACTIONS,
  UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  allowsLegacySecretExport,
  allowsUniversalWalletNormalAccess,
  getUniversalWalletMigrationRequiredAction,
  validateUniversalWalletLegacyVaultDescriptor,
  validateUniversalWalletMigrationSnapshot,
};

export type {
  UniversalWalletLegacyVaultDescriptor,
  UniversalWalletLegacyVaultMode,
  UniversalWalletMigrationPlatform,
  UniversalWalletMigrationRequiredAction,
  UniversalWalletMigrationSnapshot,
  UniversalWalletMigrationValidationError,
};
