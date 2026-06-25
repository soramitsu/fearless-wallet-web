import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  getUniversalWalletMigrationRequiredAction,
  validateUniversalWalletMigrationSnapshot,
  type UniversalWalletLegacyVaultDescriptor,
  type UniversalWalletMigrationRequiredAction,
  type UniversalWalletMigrationSnapshot,
} from '@/util/universalWalletMigrationContract';
import {
  validateUniversalWalletKeyringMeta,
  type UniversalWalletKeyringLegacyFields,
} from '@/util/universalWalletKeyringMeta';

const WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS = 1_710_000_000_000;

type WebUniversalWalletMigrationAccount = {
  address: string;
  meta?: UniversalWalletKeyringLegacyFields & {
    isMasterPassword?: boolean;
    name?: string;
  };
  type?: string;
};

type WebUniversalWalletMigrationSnapshotInput = {
  accounts: WebUniversalWalletMigrationAccount[];
  cutoffAtMillis?: number;
  nowMillis?: number;
};

function buildWebUniversalWalletMigrationSnapshot({
  accounts,
  cutoffAtMillis = WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS,
  nowMillis = Date.now(),
}: WebUniversalWalletMigrationSnapshotInput): UniversalWalletMigrationSnapshot {
  const hasUniversalWallet = hasActiveUniversalWallet(accounts);
  const legacyVaults = accounts
    .filter((account) => isLegacyVaultCandidate(account) && !isActiveUniversalWalletAccount(account))
    .map((account, index) => createLegacyVaultDescriptor(account, index, nowMillis));
  const snapshot: UniversalWalletMigrationSnapshot = {
    schemaVersion: UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
    platform: 'web',
    hasUniversalWallet,
    legacyVaults,
    cutoffAtMillis,
    evaluatedAtMillis: nowMillis,
  };
  const errors = validateUniversalWalletMigrationSnapshot(snapshot);

  if (errors.length > 0) {
    return {
      ...snapshot,
      legacyVaults: legacyVaults.filter(
        (vault) => validateUniversalWalletMigrationSnapshot({ ...snapshot, legacyVaults: [vault] }).length === 0
      ),
    };
  }

  return snapshot;
}

function getWebUniversalWalletMigrationRequiredAction(
  input: WebUniversalWalletMigrationSnapshotInput
): UniversalWalletMigrationRequiredAction {
  return getUniversalWalletMigrationRequiredAction(buildWebUniversalWalletMigrationSnapshot(input));
}

function hasActiveUniversalWallet(accounts: WebUniversalWalletMigrationAccount[]): boolean {
  return accounts.some(isActiveUniversalWalletAccount);
}

function isActiveUniversalWalletAccount({ meta }: WebUniversalWalletMigrationAccount): boolean {
  return (
    !!meta?.universalWallet &&
    meta.universalWallet.status === 'active' &&
    validateUniversalWalletKeyringMeta(meta.universalWallet).length === 0
  );
}

function isLegacyVaultCandidate({ address, meta, type }: WebUniversalWalletMigrationAccount): boolean {
  if (!address.trim()) return false;
  if (type === 'ethereum') return false;
  if (meta?.walletEcosystem === WalletEcosystem.Evm) return false;

  return true;
}

function createLegacyVaultDescriptor(
  { address, meta }: WebUniversalWalletMigrationAccount,
  index: number,
  nowMillis: number
): UniversalWalletLegacyVaultDescriptor {
  const ecosystem = normalizeWalletEcosystem(meta?.walletEcosystem);

  return {
    vaultId: createLegacyVaultId(address, index),
    accountId: `${ecosystem}-legacy-${index.toString(36)}`,
    ecosystem,
    address: address.trim(),
    displayName: normalizeDisplayName(meta?.name),
    mode: 'export-only',
    exportOnlyReason: 'pre-cutoff account export',
    canExportSecrets: true,
    canSignTransactions: false,
    discoveredAtMillis: nowMillis,
  };
}

function createLegacyVaultId(address: string, index: number): string {
  const normalized = address.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48);
  const suffix = `${normalized}${index.toString(36)}00000000`.slice(0, 56);

  return `legacy_${suffix}`;
}

function normalizeDisplayName(value: string | undefined): string | undefined {
  const displayName = value?.trim();

  return displayName ? displayName.slice(0, 64) : undefined;
}

function normalizeWalletEcosystem(value: WalletEcosystem | undefined): WalletEcosystem {
  return value && Object.values(WalletEcosystem).includes(value) ? value : WalletEcosystem.Substrate;
}

export {
  WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS,
  buildWebUniversalWalletMigrationSnapshot,
  getWebUniversalWalletMigrationRequiredAction,
  hasActiveUniversalWallet,
  isActiveUniversalWalletAccount,
};

export type { WebUniversalWalletMigrationAccount, WebUniversalWalletMigrationSnapshotInput };
