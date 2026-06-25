import { WalletEcosystem } from '@/interfaces';

const UNIVERSAL_WALLET_INDEXED_TRANSACTION_STATUSES = ['pending', 'confirmed', 'failed'] as const;
const UNIVERSAL_WALLET_INDEXED_TRANSACTION_DIRECTIONS = ['incoming', 'outgoing', 'self', 'unknown'] as const;
const UNIVERSAL_WALLET_INDEXED_OPERATION_TYPES = [
  'transfer',
  'swap',
  'stake',
  'unstake',
  'governance',
  'offline-cash',
  'sccp',
  'contract-call',
  'mint',
  'burn',
  'fee',
  'unknown',
] as const;

const UNIVERSAL_WALLET_INDEXER_MAX_PAGE_LIMIT = 250;

type UniversalWalletIndexedTransactionStatus = (typeof UNIVERSAL_WALLET_INDEXED_TRANSACTION_STATUSES)[number];
type UniversalWalletIndexedTransactionDirection = (typeof UNIVERSAL_WALLET_INDEXED_TRANSACTION_DIRECTIONS)[number];
type UniversalWalletIndexedOperationType = (typeof UNIVERSAL_WALLET_INDEXED_OPERATION_TYPES)[number];

type UniversalWalletIndexerValidationError =
  | 'invalidAccountId'
  | 'invalidEcosystem'
  | 'invalidChainId'
  | 'invalidAssetId'
  | 'invalidAmount'
  | 'invalidDecimals'
  | 'invalidSymbol'
  | 'invalidName'
  | 'invalidAddress'
  | 'invalidTransactionId'
  | 'invalidTimestamp'
  | 'invalidBlockNumber'
  | 'invalidCursor'
  | 'invalidLimit'
  | 'invalidTotal'
  | 'invalidUrl'
  | 'invalidSyncedAt';

type UniversalWalletIndexedAssetBalance = {
  accountId: string;
  ecosystem: WalletEcosystem;
  chainId: string;
  assetId: string;
  amount: string;
  decimals: number;
  isNative: boolean;
  symbol?: string;
  name?: string;
  uiAmountString?: string;
  tokenAccountId?: string;
  contractAddress?: string;
  syncedAtMillis: number;
};

type UniversalWalletIndexedTransaction = {
  accountId: string;
  ecosystem: WalletEcosystem;
  chainId: string;
  transactionId: string;
  status: UniversalWalletIndexedTransactionStatus;
  direction: UniversalWalletIndexedTransactionDirection;
  operationType: UniversalWalletIndexedOperationType;
  timestampMillis?: number;
  amount?: string;
  assetId?: string;
  feeAmount?: string;
  feeAssetId?: string;
  counterpartyAddress?: string;
  blockNumber?: string;
  cursor?: string;
  explorerUrl?: string;
  syncedAtMillis: number;
};

type UniversalWalletIndexedTokenMetadata = {
  ecosystem: WalletEcosystem;
  chainId: string;
  assetId: string;
  decimals: number;
  symbol?: string;
  name?: string;
  iconUrl?: string;
  metadataUrl?: string;
  isVerified: boolean;
  syncedAtMillis: number;
};

type UniversalWalletIndexerPageInfo = {
  nextCursor?: string;
  limit: number;
  total?: number;
  syncedAtMillis: number;
};

function validateUniversalWalletIndexedAssetBalance(
  balance: UniversalWalletIndexedAssetBalance
): UniversalWalletIndexerValidationError[] {
  const errors = new Set<UniversalWalletIndexerValidationError>();
  validateEnvelope(balance, errors);

  if (!isMachineText(balance.assetId, 160)) errors.add('invalidAssetId');
  if (!isUnsignedInteger(balance.amount)) errors.add('invalidAmount');
  if (!isValidDecimals(balance.decimals)) errors.add('invalidDecimals');
  if (hasValue(balance.symbol) && !isHumanText(balance.symbol, 32)) errors.add('invalidSymbol');
  if (hasValue(balance.name) && !isHumanText(balance.name, 96)) errors.add('invalidName');
  if (hasValue(balance.uiAmountString) && !isHumanText(balance.uiAmountString, 80)) errors.add('invalidAmount');
  if (hasValue(balance.tokenAccountId) && !isMachineText(balance.tokenAccountId, 256)) errors.add('invalidAccountId');
  if (hasValue(balance.contractAddress) && !isMachineText(balance.contractAddress, 256)) errors.add('invalidAddress');

  return [...errors];
}

function validateUniversalWalletIndexedTransaction(
  transaction: UniversalWalletIndexedTransaction
): UniversalWalletIndexerValidationError[] {
  const errors = new Set<UniversalWalletIndexerValidationError>();
  validateEnvelope(transaction, errors);

  if (!isMachineText(transaction.transactionId, 256)) errors.add('invalidTransactionId');
  if (transaction.timestampMillis !== undefined && !isPositiveSafeInteger(transaction.timestampMillis)) {
    errors.add('invalidTimestamp');
  }
  if (transaction.amount !== undefined && !isUnsignedInteger(transaction.amount)) errors.add('invalidAmount');
  if (transaction.assetId !== undefined && !isMachineText(transaction.assetId, 160)) errors.add('invalidAssetId');
  if (transaction.feeAmount !== undefined && !isUnsignedInteger(transaction.feeAmount)) errors.add('invalidAmount');
  if (transaction.feeAssetId !== undefined && !isMachineText(transaction.feeAssetId, 160)) errors.add('invalidAssetId');
  if (transaction.counterpartyAddress !== undefined && !isMachineText(transaction.counterpartyAddress, 256)) {
    errors.add('invalidAddress');
  }
  if (transaction.blockNumber !== undefined && !isUnsignedInteger(transaction.blockNumber)) errors.add('invalidBlockNumber');
  if (transaction.cursor !== undefined && !isMachineText(transaction.cursor, 512)) errors.add('invalidCursor');
  if (transaction.explorerUrl !== undefined && !isHttpsUrl(transaction.explorerUrl)) errors.add('invalidUrl');

  return [...errors];
}

function validateUniversalWalletIndexedTokenMetadata(
  metadata: UniversalWalletIndexedTokenMetadata
): UniversalWalletIndexerValidationError[] {
  const errors = new Set<UniversalWalletIndexerValidationError>();

  if (!isKnownEcosystem(metadata.ecosystem)) errors.add('invalidEcosystem');
  if (!/^[A-Za-z0-9._:-]{2,128}$/.test(metadata.chainId)) errors.add('invalidChainId');
  if (!isMachineText(metadata.assetId, 160)) errors.add('invalidAssetId');
  if (!isValidDecimals(metadata.decimals)) errors.add('invalidDecimals');
  if (hasValue(metadata.symbol) && !isHumanText(metadata.symbol, 32)) errors.add('invalidSymbol');
  if (hasValue(metadata.name) && !isHumanText(metadata.name, 96)) errors.add('invalidName');
  if (metadata.iconUrl !== undefined && !isAssetUrl(metadata.iconUrl)) errors.add('invalidUrl');
  if (metadata.metadataUrl !== undefined && !isAssetUrl(metadata.metadataUrl)) errors.add('invalidUrl');
  if (!isPositiveSafeInteger(metadata.syncedAtMillis)) errors.add('invalidSyncedAt');

  return [...errors];
}

function validateUniversalWalletIndexerPageInfo(pageInfo: UniversalWalletIndexerPageInfo): UniversalWalletIndexerValidationError[] {
  const errors = new Set<UniversalWalletIndexerValidationError>();

  if (pageInfo.nextCursor !== undefined && !isMachineText(pageInfo.nextCursor, 512)) errors.add('invalidCursor');
  if (
    !Number.isInteger(pageInfo.limit) ||
    pageInfo.limit < 1 ||
    pageInfo.limit > UNIVERSAL_WALLET_INDEXER_MAX_PAGE_LIMIT
  ) {
    errors.add('invalidLimit');
  }
  if (pageInfo.total !== undefined && (!Number.isInteger(pageInfo.total) || pageInfo.total < 0)) errors.add('invalidTotal');
  if (!isPositiveSafeInteger(pageInfo.syncedAtMillis)) errors.add('invalidSyncedAt');

  return [...errors];
}

function validateEnvelope(
  value: Pick<UniversalWalletIndexedAssetBalance, 'accountId' | 'ecosystem' | 'chainId' | 'syncedAtMillis'>,
  errors: Set<UniversalWalletIndexerValidationError>
): void {
  if (!/^[a-z0-9][a-z0-9._:-]{1,63}$/.test(value.accountId)) errors.add('invalidAccountId');
  if (!isKnownEcosystem(value.ecosystem)) errors.add('invalidEcosystem');
  if (!/^[A-Za-z0-9._:-]{2,128}$/.test(value.chainId)) errors.add('invalidChainId');
  if (!isPositiveSafeInteger(value.syncedAtMillis)) errors.add('invalidSyncedAt');
}

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== '';
}

function isKnownEcosystem(value: string): value is WalletEcosystem {
  return (Object.values(WalletEcosystem) as string[]).includes(value);
}

function isUnsignedInteger(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value);
}

function isValidDecimals(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
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

function isHttpsUrl(value: string): boolean {
  return value.startsWith('https://') && value.length > 'https://'.length && !hasWhitespaceOrControl(value);
}

function isAssetUrl(value: string): boolean {
  return (
    (value.startsWith('https://') && value.length > 'https://'.length && !hasWhitespaceOrControl(value)) ||
    (value.startsWith('ipfs://') && value.length > 'ipfs://'.length && !hasWhitespaceOrControl(value))
  );
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
  UNIVERSAL_WALLET_INDEXED_OPERATION_TYPES,
  UNIVERSAL_WALLET_INDEXED_TRANSACTION_DIRECTIONS,
  UNIVERSAL_WALLET_INDEXED_TRANSACTION_STATUSES,
  UNIVERSAL_WALLET_INDEXER_MAX_PAGE_LIMIT,
  validateUniversalWalletIndexedAssetBalance,
  validateUniversalWalletIndexedTokenMetadata,
  validateUniversalWalletIndexedTransaction,
  validateUniversalWalletIndexerPageInfo,
};

export type {
  UniversalWalletIndexedAssetBalance,
  UniversalWalletIndexedOperationType,
  UniversalWalletIndexedTokenMetadata,
  UniversalWalletIndexedTransaction,
  UniversalWalletIndexedTransactionDirection,
  UniversalWalletIndexedTransactionStatus,
  UniversalWalletIndexerPageInfo,
  UniversalWalletIndexerValidationError,
};
