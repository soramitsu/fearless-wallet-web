import { UNIVERSAL_WALLET_DERIVATION_PATHS, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address, type IrohaNetworkInput } from '@/util/iroha';
import {
  UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION,
  UNIVERSAL_WALLET_IDENTITY_SOURCES,
  validateUniversalWalletIdentity,
  type UniversalWalletIdentitySource,
  type UniversalWalletIdentityStatus,
  type UniversalWalletIdentityValidationError,
  type UniversalWalletPublicAccount,
} from '@/util/universalWalletIdentity';

const UNIVERSAL_WALLET_KEYRING_META_VERSION = 2;

type UniversalWalletKeyringMetaValidationError =
  | UniversalWalletIdentityValidationError
  | 'invalidMetaVersion'
  | 'invalidPrimaryEcosystem'
  | 'missingPrimaryAccount';

type UniversalWalletKeyringMeta = {
  metaVersion: typeof UNIVERSAL_WALLET_KEYRING_META_VERSION;
  schemaVersion: typeof UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION;
  walletId: string;
  displayName: string;
  source: UniversalWalletIdentitySource;
  status: UniversalWalletIdentityStatus;
  primaryEcosystem: WalletEcosystem;
  publicAccounts: UniversalWalletPublicAccount[];
  createdAtMillis: number;
  updatedAtMillis?: number;
};

type UniversalWalletKeyringLegacyFields = {
  name?: string;
  walletEcosystem?: WalletEcosystem;
  ethereumAddress?: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  solanaAddress?: string;
  tonAddress?: string;
  tonPublicKeyHex?: string;
  irohaAddress?: string;
  irohaPublicKeyHex?: string;
  universalWallet?: UniversalWalletKeyringMeta;
};

type BuildUniversalWalletKeyringMetaInput = {
  address: string;
  meta: UniversalWalletKeyringLegacyFields;
  walletEcosystem?: WalletEcosystem;
  source?: UniversalWalletIdentitySource;
  nowMillis?: number;
};

function buildUniversalWalletKeyringMeta({
  address,
  meta,
  walletEcosystem,
  source = 'created-24-word',
  nowMillis = Date.now(),
}: BuildUniversalWalletKeyringMetaInput): UniversalWalletKeyringMeta {
  const existing = validateUniversalWalletKeyringMeta(meta.universalWallet).length === 0 ? meta.universalWallet : undefined;
  const createdAtMillis = existing?.createdAtMillis ?? normalizeTimestamp(nowMillis);
  const primaryEcosystem = normalizeWalletEcosystem(walletEcosystem ?? meta.walletEcosystem ?? existing?.primaryEcosystem);
  const publicAccounts = buildPublicAccounts(address, meta, primaryEcosystem);
  const displayName = normalizeDisplayName(meta.name ?? existing?.displayName);

  return {
    metaVersion: UNIVERSAL_WALLET_KEYRING_META_VERSION,
    schemaVersion: UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION,
    walletId: existing?.walletId ?? createWalletId(address, createdAtMillis),
    displayName,
    source: existing?.source ?? normalizeIdentitySource(source),
    status: resolveIdentityStatus(publicAccounts),
    primaryEcosystem,
    publicAccounts,
    createdAtMillis,
    updatedAtMillis: Math.max(createdAtMillis, normalizeTimestamp(nowMillis)),
  };
}

function withUniversalWalletKeyringMeta<TMeta extends UniversalWalletKeyringLegacyFields>(
  address: string,
  meta: TMeta,
  walletEcosystem?: WalletEcosystem,
  nowMillis?: number
): TMeta & { universalWallet: UniversalWalletKeyringMeta } {
  const nextMeta = {
    ...meta,
    walletEcosystem: normalizeWalletEcosystem(walletEcosystem ?? meta.walletEcosystem),
  };

  return {
    ...nextMeta,
    universalWallet: buildUniversalWalletKeyringMeta({
      address,
      meta: nextMeta,
      walletEcosystem: nextMeta.walletEcosystem,
      nowMillis,
    }),
  };
}

function validateUniversalWalletKeyringMeta(
  universalWallet: UniversalWalletKeyringMeta | undefined
): UniversalWalletKeyringMetaValidationError[] {
  if (!universalWallet || typeof universalWallet !== 'object') {
    return ['invalidMetaVersion'];
  }

  const errors = new Set<UniversalWalletKeyringMetaValidationError>();

  if (universalWallet.metaVersion !== UNIVERSAL_WALLET_KEYRING_META_VERSION) {
    errors.add('invalidMetaVersion');
  }
  if (!Object.values(WalletEcosystem).includes(universalWallet.primaryEcosystem)) {
    errors.add('invalidPrimaryEcosystem');
  }
  if (!universalWallet.publicAccounts.some(({ ecosystem }) => ecosystem === universalWallet.primaryEcosystem)) {
    errors.add('missingPrimaryAccount');
  }

  for (const error of validateUniversalWalletIdentity({
    schemaVersion: universalWallet.schemaVersion,
    walletId: universalWallet.walletId,
    displayName: universalWallet.displayName,
    source: universalWallet.source,
    status: universalWallet.status,
    publicAccounts: universalWallet.publicAccounts,
    createdAtMillis: universalWallet.createdAtMillis,
    updatedAtMillis: universalWallet.updatedAtMillis,
  })) {
    errors.add(error);
  }

  return [...errors];
}

function buildPublicAccounts(
  address: string,
  meta: UniversalWalletKeyringLegacyFields,
  primaryEcosystem: WalletEcosystem
): UniversalWalletPublicAccount[] {
  const accounts: UniversalWalletPublicAccount[] = [];

  addPublicAccount(accounts, {
    accountId: 'substrate-default',
    ecosystem: WalletEcosystem.Substrate,
    address: primaryEcosystem === WalletEcosystem.Substrate ? address : '',
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'evm-default',
    ecosystem: WalletEcosystem.Evm,
    address: primaryEcosystem === WalletEcosystem.Evm ? address : meta.ethereumAddress,
    chainId: 'eip155:1',
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.evmDefault,
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'bitcoin-mainnet',
    ecosystem: WalletEcosystem.Bitcoin,
    address: primaryEcosystem === WalletEcosystem.Bitcoin ? address : meta.bitcoinAddress,
    chainId: 'bitcoin:mainnet',
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetFirstReceive,
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'bitcoin-testnet',
    ecosystem: WalletEcosystem.Bitcoin,
    address: meta.bitcoinTestnetAddress,
    chainId: 'bitcoin:testnet',
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinTestnetFirstReceive,
    isDefault: false,
  });
  addPublicAccount(accounts, {
    accountId: 'solana-mainnet',
    ecosystem: WalletEcosystem.Solana,
    address: primaryEcosystem === WalletEcosystem.Solana ? address : meta.solanaAddress,
    chainId: 'solana:mainnet',
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault,
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'ton-mainnet',
    ecosystem: WalletEcosystem.Ton,
    address: primaryEcosystem === WalletEcosystem.Ton ? address : meta.tonAddress,
    chainId: 'ton:mainnet',
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.tonDefault,
    publicKeyHex: normalizeHex(meta.tonPublicKeyHex),
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'iroha-taira',
    ecosystem: WalletEcosystem.Iroha,
    address: resolveIrohaAddress(address, meta, primaryEcosystem, 'taira'),
    chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId,
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
    publicKeyHex: normalizeHex(meta.irohaPublicKeyHex),
    isDefault: true,
  });
  addPublicAccount(accounts, {
    accountId: 'iroha-nexus',
    ecosystem: WalletEcosystem.Iroha,
    address: resolveIrohaAddress(address, meta, primaryEcosystem, 'nexus'),
    chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId,
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
    publicKeyHex: normalizeHex(meta.irohaPublicKeyHex),
    isDefault: false,
  });

  return accounts;
}

function addPublicAccount(accounts: UniversalWalletPublicAccount[], account: UniversalWalletPublicAccount): void {
  if (!account.address?.trim()) return;

  accounts.push({
    ...account,
    address: account.address.trim(),
  });
}

function resolveIdentityStatus(publicAccounts: UniversalWalletPublicAccount[]): UniversalWalletIdentityStatus {
  const presentEcosystems = new Set(publicAccounts.map(({ ecosystem }) => ecosystem));

  return Object.values(WalletEcosystem).every((ecosystem) => presentEcosystems.has(ecosystem))
    ? 'active'
    : 'migration-required';
}

function normalizeWalletEcosystem(value: WalletEcosystem | undefined): WalletEcosystem {
  return value && Object.values(WalletEcosystem).includes(value) ? value : WalletEcosystem.Substrate;
}

function normalizeIdentitySource(source: UniversalWalletIdentitySource): UniversalWalletIdentitySource {
  return UNIVERSAL_WALLET_IDENTITY_SOURCES.includes(source) ? source : 'created-24-word';
}

function normalizeDisplayName(value: string | undefined): string {
  const displayName = value?.trim();

  return displayName ? displayName.slice(0, 64) : 'Fearless Universal Wallet';
}

function normalizeTimestamp(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function normalizeHex(value: string | undefined): string | undefined {
  if (!value) return undefined;

  return value.trim().toLowerCase();
}

function resolveIrohaAddress(
  primaryAddress: string,
  meta: UniversalWalletKeyringLegacyFields,
  primaryEcosystem: WalletEcosystem,
  network: IrohaNetworkInput
): string | undefined {
  const tairaFallback = primaryEcosystem === WalletEcosystem.Iroha ? primaryAddress : meta.irohaAddress;
  const publicKeyHex = normalizeHex(meta.irohaPublicKeyHex);
  if (publicKeyHex) {
    try {
      return encodeIrohaI105Address(publicKeyHex, network);
    } catch {
      return network === 'taira' ? tairaFallback : undefined;
    }
  }

  return network === 'taira' ? tairaFallback : undefined;
}

function createWalletId(address: string, createdAtMillis: number): string {
  const normalizedAddress = address.replace(/[^A-Za-z0-9_-]/g, '');
  const seed = `${normalizedAddress}${createdAtMillis.toString(36)}0000000000000000`;

  return `uw2_${seed.slice(0, 60)}`;
}

export {
  UNIVERSAL_WALLET_KEYRING_META_VERSION,
  buildUniversalWalletKeyringMeta,
  validateUniversalWalletKeyringMeta,
  withUniversalWalletKeyringMeta,
};

export type {
  UniversalWalletKeyringLegacyFields,
  UniversalWalletKeyringMeta,
  UniversalWalletKeyringMetaValidationError,
};
