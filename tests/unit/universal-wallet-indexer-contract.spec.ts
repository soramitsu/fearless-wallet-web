import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_INDEXED_OPERATION_TYPES,
  validateUniversalWalletIndexedAssetBalance,
  validateUniversalWalletIndexedTokenMetadata,
  validateUniversalWalletIndexedTransaction,
  validateUniversalWalletIndexerPageInfo,
  type UniversalWalletIndexedAssetBalance,
  type UniversalWalletIndexedTransaction,
} from '@/util/universalWalletIndexerContract';

describe('Universal Wallet indexer contract', () => {
  it('validates and serializes normalized asset balances', () => {
    const balance = assetBalance();

    expect(validateUniversalWalletIndexedAssetBalance(balance)).toEqual([]);
    expect(JSON.stringify(balance)).toContain('"ecosystem":"solana"');
    expect(JSON.stringify(balance)).toContain('"assetId":"SOL"');
    expect(JSON.stringify(balance)).toContain('"amount":"123456789"');
  });

  it('rejects malformed asset balances', () => {
    const errors = validateUniversalWalletIndexedAssetBalance({
      ...assetBalance(),
      accountId: '../bad',
      ecosystem: 'unknown' as WalletEcosystem,
      chainId: '../bad',
      assetId: ' SOL ',
      amount: '-1',
      decimals: 256,
      symbol: 'bad\u0000symbol',
      name: 'bad\u0000name',
      tokenAccountId: ' token ',
      contractAddress: ' contract ',
      syncedAtMillis: 0,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'invalidAccountId',
        'invalidEcosystem',
        'invalidChainId',
        'invalidAssetId',
        'invalidAmount',
        'invalidDecimals',
        'invalidSymbol',
        'invalidName',
        'invalidAddress',
        'invalidSyncedAt',
      ])
    );
  });

  it('validates and serializes normalized transactions', () => {
    const transaction = indexedTransaction();

    expect(validateUniversalWalletIndexedTransaction(transaction)).toEqual([]);
    expect(JSON.stringify(transaction)).toContain('"status":"confirmed"');
    expect(JSON.stringify(transaction)).toContain('"direction":"outgoing"');
    expect(JSON.stringify(transaction)).toContain('"operationType":"transfer"');
  });

  it('exposes typed Nexus operation buckets for indexers', () => {
    expect(UNIVERSAL_WALLET_INDEXED_OPERATION_TYPES).toEqual(
      expect.arrayContaining(['governance', 'offline-cash', 'sccp', 'contract-call'])
    );
  });

  it('rejects malformed normalized transactions', () => {
    const errors = validateUniversalWalletIndexedTransaction({
      ...indexedTransaction(),
      accountId: 'bad account',
      ecosystem: 'bad' as WalletEcosystem,
      chainId: 'bad chain',
      transactionId: ' tx ',
      timestampMillis: -1,
      amount: '01',
      assetId: ' asset ',
      feeAmount: '1.2',
      feeAssetId: ' fee ',
      counterpartyAddress: ' counterparty ',
      blockNumber: '-2',
      cursor: ' cursor ',
      explorerUrl: 'http://example.com/tx',
      syncedAtMillis: 0,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'invalidAccountId',
        'invalidEcosystem',
        'invalidChainId',
        'invalidTransactionId',
        'invalidTimestamp',
        'invalidAmount',
        'invalidAssetId',
        'invalidAddress',
        'invalidBlockNumber',
        'invalidCursor',
        'invalidUrl',
        'invalidSyncedAt',
      ])
    );
  });

  it('validates token metadata and page info contracts', () => {
    expect(
      validateUniversalWalletIndexedTokenMetadata({
        ecosystem: WalletEcosystem.Ton,
        chainId: 'ton:mainnet',
        assetId: 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c',
        decimals: 9,
        symbol: 'TON',
        name: 'Toncoin',
        iconUrl: 'ipfs://bafybeigdyrzt',
        metadataUrl: 'https://example.com/ton.json',
        isVerified: true,
        syncedAtMillis: 1_710_000_000_000,
      })
    ).toEqual([]);
    expect(
      validateUniversalWalletIndexerPageInfo({
        nextCursor: 'next-cursor',
        limit: 100,
        total: 1,
        syncedAtMillis: 1_710_000_000_000,
      })
    ).toEqual([]);
  });

  it('rejects malformed token metadata and page info contracts', () => {
    const metadataErrors = validateUniversalWalletIndexedTokenMetadata({
      ecosystem: 'bad' as WalletEcosystem,
      chainId: 'bad chain',
      assetId: ' asset ',
      decimals: -1,
      symbol: 'bad\u0000symbol',
      name: 'bad\u0000name',
      iconUrl: 'ftp://example.com/icon.png',
      metadataUrl: 'http://example.com/meta.json',
      isVerified: false,
      syncedAtMillis: 0,
    });
    const pageErrors = validateUniversalWalletIndexerPageInfo({
      nextCursor: ' cursor ',
      limit: 251,
      total: -1,
      syncedAtMillis: 0,
    });

    expect(metadataErrors).toEqual(
      expect.arrayContaining([
        'invalidEcosystem',
        'invalidChainId',
        'invalidAssetId',
        'invalidDecimals',
        'invalidSymbol',
        'invalidName',
        'invalidUrl',
        'invalidSyncedAt',
      ])
    );
    expect(pageErrors).toEqual(expect.arrayContaining(['invalidCursor', 'invalidLimit', 'invalidTotal', 'invalidSyncedAt']));
  });
});

function assetBalance(): UniversalWalletIndexedAssetBalance {
  return {
    accountId: 'solana-mainnet',
    ecosystem: WalletEcosystem.Solana,
    chainId: 'solana:mainnet',
    assetId: 'SOL',
    amount: '123456789',
    decimals: 9,
    isNative: true,
    symbol: 'SOL',
    name: 'Solana',
    uiAmountString: '0.123456789',
    syncedAtMillis: 1_710_000_000_000,
  };
}

function indexedTransaction(): UniversalWalletIndexedTransaction {
  const txid = 'a'.repeat(64);

  return {
    accountId: 'bitcoin-mainnet',
    ecosystem: WalletEcosystem.Bitcoin,
    chainId: 'bitcoin:mainnet',
    transactionId: txid,
    status: 'confirmed',
    direction: 'outgoing',
    operationType: 'transfer',
    timestampMillis: 1_710_000_000_000,
    amount: '1000',
    assetId: 'BTC',
    feeAmount: '100',
    feeAssetId: 'BTC',
    counterpartyAddress: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
    blockNumber: '800000',
    cursor: txid,
    explorerUrl: `https://mempool.space/tx/${txid}`,
    syncedAtMillis: 1_710_000_000_000,
  };
}
