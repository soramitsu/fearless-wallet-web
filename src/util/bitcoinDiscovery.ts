import {
  BitcoinEsploraClient,
  type BitcoinEsploraAddress,
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
  index: number;
  path: string;
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
  client?: BitcoinDiscoveryClient;
  gapLimit?: number;
  maxLookahead?: number;
  mnemonicOrSeed: string;
  network?: BitcoinDerivationNetwork;
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

export async function discoverBitcoinReceiveAddresses({
  client,
  gapLimit,
  maxLookahead = BITCOIN_DISCOVERY_DEFAULT_MAX_LOOKAHEAD,
  mnemonicOrSeed,
  network = 'mainnet',
}: DiscoverBitcoinReceiveAddressesParams): Promise<BitcoinDiscoveryResult> {
  const resolvedGapLimit = gapLimit ?? UNIVERSAL_WALLET_BITCOIN_NETWORKS[network].defaultGapLimit;

  validateDiscoveryParams({ gapLimit: resolvedGapLimit, maxLookahead, mnemonicOrSeed });

  const indexer = client ?? new BitcoinEsploraClient({ network });
  const addresses: BitcoinDiscoveredAddress[] = [];
  let consecutiveUnused = 0;
  let index = 0;
  let lastUsedIndex: number | null = null;

  while (consecutiveUnused < resolvedGapLimit && index < maxLookahead) {
    const path = getBitcoinReceivePath(network, index);
    const address = deriveBitcoinReceiveAddress({ mnemonicOrSeed, network, path });
    const stats = await indexer.getAddress(address);
    const txCount = getTransactionCount(stats);
    const used = txCount > 0;
    const item: BitcoinDiscoveredAddress = {
      address,
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
  const nextReceivePath = getBitcoinReceivePath(network, nextReceiveIndex);
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

export {
  BITCOIN_DISCOVERY_DEFAULT_MAX_LOOKAHEAD,
  BITCOIN_DISCOVERY_MAX_GAP_LIMIT,
  BITCOIN_DISCOVERY_MAX_LOOKAHEAD,
  BitcoinDiscoveryError,
  type BitcoinDiscoveryClient,
  type BitcoinDiscoveredAddress,
  type BitcoinDiscoveryResult,
  type DiscoverBitcoinReceiveAddressesParams,
};
