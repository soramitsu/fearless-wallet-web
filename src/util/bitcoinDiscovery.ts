import {
  BitcoinEsploraClient,
  type BitcoinEsploraAddress,
  type BitcoinAddressBalance,
} from '@extension-base/services/bitcoin-indexer-service';
import {
  deriveBitcoinReceiveAddress,
  getBitcoinReceivePath,
  type BitcoinDerivationNetwork,
} from '@/util/bitcoinKeyring';
import { UNIVERSAL_WALLET_BITCOIN_NETWORKS } from '@/consts/universalWallet';

type BitcoinDiscoveryClient = Pick<BitcoinEsploraClient, 'getAddress'>;

type BitcoinDiscoveredAddress = {
  address: string;
  change: 0 | 1;
  confirmedSats: number;
  index: number;
  mempoolSats: number;
  path: string;
  totalSats: number;
  txCount: number;
  used: boolean;
};

type BitcoinDiscoveryResult = {
  addresses: BitcoinDiscoveredAddress[];
  gapLimit: number;
  lastUsedIndex: number | null;
  nextReceiveAddress: string;
  nextReceiveIndex: number;
  nextReceivePath: string;
  stopReason: 'gap_limit';
  usedAddresses: BitcoinDiscoveredAddress[];
};

type DiscoverBitcoinReceiveAddressesParams = {
  change?: 0 | 1;
  client?: BitcoinDiscoveryClient;
  gapLimit?: number;
  maxLookahead?: number;
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
};

type BitcoinWalletDiscoveryResult = {
  addresses: BitcoinDiscoveredAddress[];
  change: BitcoinDiscoveryResult;
  nextChangeAddress: string;
  nextChangeIndex: number;
  nextChangePath: string;
  nextReceiveAddress: string;
  nextReceiveIndex: number;
  nextReceivePath: string;
  receive: BitcoinDiscoveryResult;
  usedAddresses: BitcoinDiscoveredAddress[];
};

class BitcoinDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BitcoinDiscoveryError';
  }
}

const BITCOIN_DISCOVERY_DEFAULT_MAX_LOOKAHEAD = 1_000;
const BITCOIN_DISCOVERY_MAX_GAP_LIMIT = 100;
const BITCOIN_DISCOVERY_MAX_LOOKAHEAD = 10_000;
const MAX_BITCOIN_SATOSHIS = 2_100_000_000_000_000;

export async function discoverBitcoinReceiveAddresses({
  change = 0,
  client,
  gapLimit,
  maxLookahead = BITCOIN_DISCOVERY_DEFAULT_MAX_LOOKAHEAD,
  mnemonicOrSeed,
  network = 'mainnet',
}: DiscoverBitcoinReceiveAddressesParams): Promise<BitcoinDiscoveryResult> {
  const resolvedGapLimit = gapLimit ?? UNIVERSAL_WALLET_BITCOIN_NETWORKS[network].defaultGapLimit;

  validateDiscoveryParams({ gapLimit: resolvedGapLimit, maxLookahead, mnemonicOrSeed });
  if (change !== 0 && change !== 1) throw new BitcoinDiscoveryError('invalid_change_branch');

  const indexer = client ?? new BitcoinEsploraClient({ network });
  const addresses: BitcoinDiscoveredAddress[] = [];
  let consecutiveUnused = 0;
  let index = 0;
  let lastUsedIndex: number | null = null;

  while (consecutiveUnused < resolvedGapLimit && index < maxLookahead) {
    const path = getBitcoinReceivePath(network, index, change);
    const address = deriveBitcoinReceiveAddress({ mnemonicOrSeed, network, path });
    const stats = await indexer.getAddress(address);
    const txCount = getTransactionCount(stats);
    const balance = getAddressBalance(stats);
    const used = txCount > 0;
    const item: BitcoinDiscoveredAddress = {
      address,
      change,
      ...balance,
      index,
      path,
      txCount,
      used,
    };

    addresses.push(item);

    if (used) {
      lastUsedIndex = index;
      consecutiveUnused = 0;
    } else {
      consecutiveUnused += 1;
    }

    index += 1;
  }

  if (consecutiveUnused < resolvedGapLimit) throw new BitcoinDiscoveryError('bitcoin_discovery_lookahead_exhausted');

  const nextReceiveIndex = (lastUsedIndex ?? -1) + 1;
  const nextReceivePath = getBitcoinReceivePath(network, nextReceiveIndex, change);
  const nextReceiveAddress = deriveBitcoinReceiveAddress({ mnemonicOrSeed, network, path: nextReceivePath });
  const usedAddresses = addresses.filter(({ used }) => used);

  return {
    addresses,
    gapLimit: resolvedGapLimit,
    lastUsedIndex,
    nextReceiveAddress,
    nextReceiveIndex,
    nextReceivePath,
    stopReason: 'gap_limit',
    usedAddresses,
  };
}

export async function discoverBitcoinWalletAddresses(
  params: Omit<DiscoverBitcoinReceiveAddressesParams, 'change'>
): Promise<BitcoinWalletDiscoveryResult> {
  const [receive, change] = await Promise.all([
    discoverBitcoinReceiveAddresses({ ...params, change: 0 }),
    discoverBitcoinReceiveAddresses({ ...params, change: 1 }),
  ]);
  const addresses = [...receive.addresses, ...change.addresses];
  const uniqueAddresses = new Set(addresses.map(({ address }) => address.toLowerCase()));

  if (uniqueAddresses.size !== addresses.length) throw new BitcoinDiscoveryError('duplicate_discovered_address');

  return {
    addresses,
    change,
    nextChangeAddress: change.nextReceiveAddress,
    nextChangeIndex: change.nextReceiveIndex,
    nextChangePath: change.nextReceivePath,
    nextReceiveAddress: receive.nextReceiveAddress,
    nextReceiveIndex: receive.nextReceiveIndex,
    nextReceivePath: receive.nextReceivePath,
    receive,
    usedAddresses: addresses.filter(({ used }) => used),
  };
}

export function aggregateBitcoinDiscoveryBalance(
  addresses: readonly BitcoinDiscoveredAddress[]
): BitcoinAddressBalance {
  return aggregateBitcoinAddressBalances(addresses);
}

export function aggregateBitcoinAddressBalances(
  balances: readonly BitcoinAddressBalance[]
): BitcoinAddressBalance {
  return balances.reduce<BitcoinAddressBalance>(
    (total, balance) => ({
      confirmedSats: safeAddSats(total.confirmedSats, balance.confirmedSats),
      mempoolSats: safeAddSignedSats(total.mempoolSats, balance.mempoolSats),
      totalSats: safeAddSats(total.totalSats, balance.totalSats),
    }),
    { confirmedSats: 0, mempoolSats: 0, totalSats: 0 }
  );
}

function validateDiscoveryParams({
  gapLimit,
  maxLookahead,
  mnemonicOrSeed,
}: Required<Pick<DiscoverBitcoinReceiveAddressesParams, 'gapLimit' | 'maxLookahead' | 'mnemonicOrSeed'>>): void {
  if (!mnemonicOrSeed.trim()) throw new BitcoinDiscoveryError('mnemonic_required');
  if (!Number.isInteger(gapLimit) || gapLimit <= 0 || gapLimit > BITCOIN_DISCOVERY_MAX_GAP_LIMIT) {
    throw new BitcoinDiscoveryError('invalid_gap_limit');
  }
  if (
    !Number.isInteger(maxLookahead) ||
    maxLookahead < gapLimit ||
    maxLookahead > BITCOIN_DISCOVERY_MAX_LOOKAHEAD
  ) {
    throw new BitcoinDiscoveryError('invalid_max_lookahead');
  }
}

function getTransactionCount({ chain_stats: chainStats, mempool_stats: mempoolStats }: BitcoinEsploraAddress): number {
  const txCount = chainStats.tx_count + mempoolStats.tx_count;

  if (!Number.isSafeInteger(txCount) || txCount < 0) throw new BitcoinDiscoveryError('invalid_transaction_count');

  return txCount;
}

function getAddressBalance({ chain_stats: chainStats, mempool_stats: mempoolStats }: BitcoinEsploraAddress): BitcoinAddressBalance {
  const confirmedSats = chainStats.funded_txo_sum - chainStats.spent_txo_sum;
  const mempoolSats = mempoolStats.funded_txo_sum - mempoolStats.spent_txo_sum;
  const totalSats = confirmedSats + mempoolSats;

  if (
    !Number.isSafeInteger(confirmedSats) ||
    confirmedSats < 0 ||
    confirmedSats > MAX_BITCOIN_SATOSHIS ||
    !Number.isSafeInteger(mempoolSats) ||
    Math.abs(mempoolSats) > MAX_BITCOIN_SATOSHIS ||
    !Number.isSafeInteger(totalSats) ||
    totalSats < 0 ||
    totalSats > MAX_BITCOIN_SATOSHIS
  ) {
    throw new BitcoinDiscoveryError('invalid_address_balance');
  }

  return { confirmedSats, mempoolSats, totalSats };
}

function safeAddSats(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result) || result < 0 || result > MAX_BITCOIN_SATOSHIS) {
    throw new BitcoinDiscoveryError('invalid_aggregate_balance');
  }

  return result;
}

function safeAddSignedSats(left: number, right: number): number {
  const result = left + right;

  if (!Number.isSafeInteger(result) || Math.abs(result) > MAX_BITCOIN_SATOSHIS) {
    throw new BitcoinDiscoveryError('invalid_aggregate_balance');
  }

  return result;
}

export {
  BITCOIN_DISCOVERY_DEFAULT_MAX_LOOKAHEAD,
  BITCOIN_DISCOVERY_MAX_GAP_LIMIT,
  BITCOIN_DISCOVERY_MAX_LOOKAHEAD,
  BitcoinDiscoveryError,
  type BitcoinDiscoveryClient,
  type BitcoinDiscoveredAddress,
  type BitcoinDiscoveryResult,
  type BitcoinWalletDiscoveryResult,
  type DiscoverBitcoinReceiveAddressesParams,
};
