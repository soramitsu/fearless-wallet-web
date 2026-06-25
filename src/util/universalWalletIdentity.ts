import { WalletEcosystem } from '@/interfaces';

const UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION = 2;

const UNIVERSAL_WALLET_IDENTITY_SOURCES = [
  'created-24-word',
  'imported-12-word',
  'imported-24-word',
  'legacy-import',
] as const;

const UNIVERSAL_WALLET_IDENTITY_STATUSES = ['active', 'migration-required', 'legacy-export-only'] as const;

type UniversalWalletIdentitySource = (typeof UNIVERSAL_WALLET_IDENTITY_SOURCES)[number];
type UniversalWalletIdentityStatus = (typeof UNIVERSAL_WALLET_IDENTITY_STATUSES)[number];

type UniversalWalletIdentityValidationError =
  | 'invalidSchemaVersion'
  | 'invalidWalletId'
  | 'invalidDisplayName'
  | 'invalidTimestamps'
  | 'publicAccountsRequired'
  | 'missingActiveEcosystem'
  | 'invalidLegacySource'
  | 'legacyReasonRequired'
  | 'legacyReasonNotAllowed'
  | 'duplicateAccountId'
  | 'invalidAccountId'
  | 'invalidEcosystem'
  | 'invalidAddress'
  | 'invalidChainId'
  | 'invalidDerivationPath'
  | 'invalidPublicKeyHex';

type UniversalWalletPublicAccount = {
  accountId: string;
  ecosystem: WalletEcosystem;
  address: string;
  chainId?: string;
  derivationPath?: string;
  publicKeyHex?: string;
  isDefault: boolean;
};

type UniversalWalletIdentity = {
  schemaVersion: number;
  walletId: string;
  displayName: string;
  source: UniversalWalletIdentitySource;
  status: UniversalWalletIdentityStatus;
  publicAccounts: UniversalWalletPublicAccount[];
  createdAtMillis: number;
  updatedAtMillis?: number;
  legacyExportOnlyReason?: string;
};

class UniversalWalletIdentityError extends Error {
  readonly errors: UniversalWalletIdentityValidationError[];

  constructor(errors: UniversalWalletIdentityValidationError[]) {
    super(errors.join(','));
    this.name = 'UniversalWalletIdentityError';
    this.errors = errors;
  }
}

function validateUniversalWalletIdentity(identity: UniversalWalletIdentity): UniversalWalletIdentityValidationError[] {
  const errors = new Set<UniversalWalletIdentityValidationError>();

  if (identity.schemaVersion !== UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION) {
    errors.add('invalidSchemaVersion');
  }
  if (!/^uw2_[A-Za-z0-9_-]{16,64}$/.test(identity.walletId)) {
    errors.add('invalidWalletId');
  }
  if (!isHumanText(identity.displayName, 64)) {
    errors.add('invalidDisplayName');
  }
  if (
    !Number.isSafeInteger(identity.createdAtMillis) ||
    identity.createdAtMillis <= 0 ||
    (identity.updatedAtMillis !== undefined &&
      (!Number.isSafeInteger(identity.updatedAtMillis) || identity.updatedAtMillis < identity.createdAtMillis))
  ) {
    errors.add('invalidTimestamps');
  }

  if (identity.status !== 'legacy-export-only' && identity.publicAccounts.length === 0) {
    errors.add('publicAccountsRequired');
  }
  if (identity.status === 'active') {
    const present = new Set(identity.publicAccounts.map(({ ecosystem }) => ecosystem));
    if (!sameSet(present, new Set(Object.values(WalletEcosystem)))) {
      errors.add('missingActiveEcosystem');
    }
  }
  if (identity.status === 'legacy-export-only') {
    if (identity.source !== 'legacy-import') {
      errors.add('invalidLegacySource');
    }
    if (!isHumanText(identity.legacyExportOnlyReason, 160)) {
      errors.add('legacyReasonRequired');
    }
  } else if (identity.legacyExportOnlyReason?.trim()) {
    errors.add('legacyReasonNotAllowed');
  }

  const accountIds = new Set<string>();
  for (const account of identity.publicAccounts) {
    for (const error of validateUniversalWalletPublicAccount(account)) {
      errors.add(error);
    }
    if (accountIds.has(account.accountId)) {
      errors.add('duplicateAccountId');
    }
    accountIds.add(account.accountId);
  }

  return [...errors];
}

function assertUniversalWalletIdentity(identity: UniversalWalletIdentity): UniversalWalletIdentity {
  const errors = validateUniversalWalletIdentity(identity);
  if (errors.length) {
    throw new UniversalWalletIdentityError(errors);
  }

  return identity;
}

function validateUniversalWalletPublicAccount(account: UniversalWalletPublicAccount): UniversalWalletIdentityValidationError[] {
  const errors = new Set<UniversalWalletIdentityValidationError>();

  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(account.accountId)) {
    errors.add('invalidAccountId');
  }
  if (!Object.values(WalletEcosystem).includes(account.ecosystem)) {
    errors.add('invalidEcosystem');
  }
  if (!isMachineText(account.address, 256)) {
    errors.add('invalidAddress');
  }
  if (account.chainId !== undefined && !/^[A-Za-z0-9._:-]{2,128}$/.test(account.chainId)) {
    errors.add('invalidChainId');
  }
  if (account.derivationPath?.trim() && !/^m(?:\/[0-9]+'?)*$/.test(account.derivationPath)) {
    errors.add('invalidDerivationPath');
  }
  if (
    account.publicKeyHex !== undefined &&
    (!/^[0-9a-f]{64,260}$/.test(account.publicKeyHex) || account.publicKeyHex.length % 2 !== 0)
  ) {
    errors.add('invalidPublicKeyHex');
  }

  return [...errors];
}

function isHumanText(value: string | undefined, maxLength: number): boolean {
  const normalized = value?.trim();
  return !!normalized && normalized.length <= maxLength && !hasControlCharacters(normalized);
}

function isMachineText(value: string, maxLength: number): boolean {
  return (
    !!value &&
    value.length <= maxLength &&
    value === value.trim() &&
    [...value].every((char) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return codePoint > 0x20 && codePoint !== 0x7f;
    })
  );
}

function sameSet<T>(left: Set<T>, right: Set<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export {
  UNIVERSAL_WALLET_IDENTITY_SCHEMA_VERSION,
  UNIVERSAL_WALLET_IDENTITY_SOURCES,
  UNIVERSAL_WALLET_IDENTITY_STATUSES,
  UniversalWalletIdentityError,
  assertUniversalWalletIdentity,
  validateUniversalWalletIdentity,
  validateUniversalWalletPublicAccount,
};

export type {
  UniversalWalletIdentity,
  UniversalWalletIdentitySource,
  UniversalWalletIdentityStatus,
  UniversalWalletIdentityValidationError,
  UniversalWalletPublicAccount,
};
