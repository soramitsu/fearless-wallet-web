import { type BasicTxResponse } from '@extension-base/background/types/types';
import {
  BitcoinEsploraClient,
  type BitcoinFeeEstimates,
} from '@extension-base/services/bitcoin-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { getBitcoinAddressNetwork, isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';
import { getBitcoinReceivePath } from '@/util/bitcoinKeyring';
import {
  discoverBitcoinWalletAddresses,
  type BitcoinDiscoveryClient,
  type BitcoinWalletDiscoveryResult,
} from '@/util/bitcoinDiscovery';
import {
  prepareBitcoinSend,
  quoteBitcoinSend,
  sendBitcoinTransaction,
  type BitcoinSendClient,
  type BitcoinOutpoint,
  type BitcoinSendSource,
} from '@/util/bitcoinSend';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { isBitcoinTransfersEnabled } from '@/util/releaseFeatures';

const BITCOIN_DECIMALS = 8;
const MAX_SATOSHI = 2_100_000_000_000_000n;

type HandleBasicTx = (data: BasicTxResponse) => void;

type BitcoinTransferParams = {
  amount: string;
  approvedMaxFee?: string;
  sendMax?: boolean;
  bitcoinFeeRateSatPerVbyte?: number;
  bitcoinFeeTargetBlocks?: number;
  bitcoinIncludeUnconfirmed?: boolean;
  bitcoinMaxInputs?: number;
  bitcoinSelectedOutpoints?: BitcoinOutpoint[];
  callback?: HandleBasicTx;
  from: string;
  networkKey: NetworkName;
  state: State;
  to: string;
};

type BitcoinTransferSource = {
  accountAddress: string;
  bitcoinAddress?: string;
  bitcoinTestnetAddress?: string;
  mnemonicOrSeed: string;
  source: BitcoinSendSource;
};
type BitcoinTransferClient = BitcoinSendClient & BitcoinDiscoveryClient;
type BitcoinDiscoveredTransferSources = {
  changeAddress: string;
  discovery: BitcoinWalletDiscoveryResult;
  sources: BitcoinSendSource[];
};

const QUOTE_DISCOVERY_TTL_MS = 30_000;
const MAX_QUOTE_DISCOVERY_ENTRIES = 32;
type QuoteDiscoveryEntry = {
  accountAddress: string;
  network: BitcoinNetworkKind;
  expiresAt: number;
  result: Promise<BitcoinDiscoveredTransferSources>;
};
// Only public discovery results are retained, scoped to the wallet state. UTXOs and fees are never cached.
const quoteDiscoveryCache = new WeakMap<State, Map<string, QuoteDiscoveryEntry>>();

function invalidateQuoteDiscovery(state: State, accountAddress: string, network: BitcoinNetworkKind): void {
  const entries = quoteDiscoveryCache.get(state);

  for (const [key, entry] of entries ?? []) {
    if (entry.accountAddress === accountAddress && entry.network === network) entries?.delete(key);
  }
}

function getQuoteDiscovery(
  state: State,
  source: BitcoinTransferSource,
  network: BitcoinNetworkKind,
  client: BitcoinDiscoveryClient,
  options: { gapLimit?: number; maxLookahead?: number }
): Promise<BitcoinDiscoveredTransferSources> {
  let entries = quoteDiscoveryCache.get(state);

  if (!entries) {
    entries = new Map();
    quoteDiscoveryCache.set(state, entries);
  }
  const cache = entries;
  const key = JSON.stringify([source.accountAddress, source.source.address, network, options.gapLimit, options.maxLookahead]);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) return cached.result;
  cache.delete(key);
  while (cache.size >= MAX_QUOTE_DISCOVERY_ENTRIES) cache.delete(cache.keys().next().value!);

  const entry: QuoteDiscoveryEntry = {
    accountAddress: source.accountAddress,
    network,
    expiresAt: Date.now() + QUOTE_DISCOVERY_TTL_MS,
    result: discoverBitcoinTransferSources(source, network, client, options).then((result) => {
      entry.expiresAt = Date.now() + QUOTE_DISCOVERY_TTL_MS;

      return result;
    }).catch((error: unknown) => {
      if (cache.get(key) === entry) cache.delete(key);

      throw error;
    }),
  };

  cache.set(key, entry);

  return entry.result;
}

export function isBitcoinTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Bitcoin;
}

export async function estimateBitcoinTransferFee(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: { gapLimit?: number; maxLookahead?: number } = {}
): Promise<{ fee: string; maxAmount?: string }> {
  if (!isBitcoinTransfersEnabled()) throw new Error('bitcoin_transfer_disabled');

  const network = getBitcoinNetworkKind(params.state.networkService.networkMap[params.networkKey]);
  const source = resolveBitcoinTransferSource(params.state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const discovered = await getQuoteDiscovery(params.state, source, network, indexer, discoveryOptions);
  const quote = await quoteBitcoinSend({
    amountSat: params.sendMax ? 1 : bitcoinAmountToSats(params.amount),
    changeAddress: discovered.changeAddress,
    client: indexer,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    network,
    selectedOutpoints: params.bitcoinSelectedOutpoints,
    sendMax: params.sendMax,
    sources: discovered.sources,
    toAddress: normalizeRecipient(params.to, network),
  });

  return {
    fee: satsToBitcoinString(quote.fee),
    ...(params.sendMax ? { maxAmount: satsToBitcoinString(quote.amountSat) } : {}),
  };
}

export async function makeBitcoinTransfer(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: { gapLimit?: number; maxLookahead?: number } = {}
): Promise<void> {
  if (!isBitcoinTransfersEnabled()) throw new Error('bitcoin_transfer_disabled');
  if (typeof params.approvedMaxFee !== 'string') throw new Error('transfer_fee_approval_required');

  const approvedMaxFeeSat = bitcoinAmountToSats(params.approvedMaxFee);

  const { amount, callback, networkKey, state, to } = params;
  const network = getBitcoinNetworkKind(state.networkService.networkMap[networkKey]);
  const source = resolveBitcoinTransferSource(state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const amountSat = bitcoinAmountToSats(amount);
  invalidateQuoteDiscovery(state, source.accountAddress, network);
  const discovered = await discoverBitcoinTransferSources(source, network, indexer, discoveryOptions);

  let result;

  try {
    result = await sendBitcoinTransaction({
      amountSat,
      approvedMaxFeeSat,
      changeAddress: discovered.changeAddress,
      feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
      feeTargetBlocks: params.bitcoinFeeTargetBlocks,
      includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
      maxInputs: params.bitcoinMaxInputs,
      client: indexer,
      mnemonicOrSeed: source.mnemonicOrSeed,
      network,
      selectedOutpoints: params.bitcoinSelectedOutpoints,
      sources: discovered.sources,
      toAddress: normalizeRecipient(to, network),
    });
  } finally {
    // Accepted and uncertain submissions may have created a new change address.
    invalidateQuoteDiscovery(state, source.accountAddress, network);
  }

  callback?.({ status: true });

  setTimeout(() => {
    state.balanceService
      .fetchBalance({
        address: source.accountAddress,
        bitcoinAddress: source.bitcoinAddress,
        bitcoinNetworks: [networkKey],
        bitcoinTestnetAddress: source.bitcoinTestnetAddress,
        ethereumAddress: '',
        walletEcosystem: WalletEcosystem.Bitcoin,
      })
      .catch((error) => console.warn('Failed to refresh Bitcoin balance after transfer', error));
  }, 8000);

  console.info(`Bitcoin transfer broadcast: ${result.broadcastTxid}`);
}

export async function prepareBitcoinTransferForTest(
  params: BitcoinTransferParams,
  client: BitcoinTransferClient,
  discoveryOptions: { gapLimit?: number; maxLookahead?: number } = {}
): Promise<Awaited<ReturnType<typeof prepareBitcoinSend>>> {
  const network = getBitcoinNetworkKind(params.state.networkService.networkMap[params.networkKey]);
  const source = resolveBitcoinTransferSource(params.state, params.from, network);
  const discovered = await discoverBitcoinTransferSources(source, network, client, discoveryOptions);

  return prepareBitcoinSend({
    amountSat: bitcoinAmountToSats(params.amount),
    changeAddress: discovered.changeAddress,
    client,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    mnemonicOrSeed: source.mnemonicOrSeed,
    network,
    selectedOutpoints: params.bitcoinSelectedOutpoints,
    sources: discovered.sources,
    toAddress: normalizeRecipient(params.to, network),
  });
}

export async function discoverBitcoinTransferSources(
  source: BitcoinTransferSource,
  network: BitcoinNetworkKind,
  client: BitcoinDiscoveryClient,
  options: { gapLimit?: number; maxLookahead?: number } = {}
): Promise<BitcoinDiscoveredTransferSources> {
  const discovery = await discoverBitcoinWalletAddresses({
    client,
    gapLimit: options.gapLimit,
    maxLookahead: options.maxLookahead,
    mnemonicOrSeed: source.mnemonicOrSeed,
    network,
  });
  const firstReceive = discovery.receive.addresses[0];

  if (!firstReceive || firstReceive.address.toLowerCase() !== source.source.address.toLowerCase()) {
    throw new Error('bitcoin_discovery_source_mismatch');
  }

  const sources = discovery.usedAddresses.map(({ address, path }) => ({
    address,
    derivationPath: path,
  }));

  return {
    changeAddress: discovery.nextChangeAddress,
    discovery,
    sources: sources.length ? sources : [source.source],
  };
}

export function getBitcoinNetworkKind(network: NetworkJson | undefined): BitcoinNetworkKind {
  if (!isBitcoinTransferNetwork(network)) throw new Error('unsupported_bitcoin_network');

  const descriptor = [network.name, network.key, network.chainId, ...(network.options ?? [])].join(' ').toLowerCase();

  return descriptor.includes('testnet') || descriptor.includes('test net') || descriptor.includes('bitcoin:testnet')
    ? 'testnet'
    : 'mainnet';
}

export function bitcoinAmountToSats(amount: string): number {
  const normalized = amount.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,8})?)?$/u.exec(normalized);

  if (!match) throw new Error('invalid_bitcoin_amount');

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? '').padEnd(BITCOIN_DECIMALS, '0'));
  const sats = whole * 100_000_000n + fraction;

  if (sats <= 0n || sats > MAX_SATOSHI || sats > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('invalid_bitcoin_amount');
  }

  return Number(sats);
}

export function satsToBitcoinString(sats: number): string {
  if (!Number.isSafeInteger(sats) || sats < 0) throw new Error('invalid_bitcoin_amount');

  const whole = Math.floor(sats / 100_000_000).toString();
  const fractional = (sats % 100_000_000).toString().padStart(BITCOIN_DECIMALS, '0').replace(/0+$/u, '');

  return fractional ? `${whole}.${fractional}` : whole;
}

export function resolveBitcoinTransferSource(
  state: State,
  from: string,
  network: BitcoinNetworkKind
): BitcoinTransferSource {
  const account = state.keyringService.getAllAccounts().find(({ address, meta }) => {
    const { bitcoinAddress, bitcoinTestnetAddress } = meta as FWKeyringMeta;

    return (
      address === from ||
      bitcoinAddress?.toLowerCase() === from.toLowerCase() ||
      bitcoinTestnetAddress?.toLowerCase() === from.toLowerCase()
    );
  });

  if (!account) throw new Error('bitcoin_account_not_found');

  const meta = account.meta as FWKeyringMeta;
  const sourceAddress = network === 'testnet' ? meta.bitcoinTestnetAddress : meta.bitcoinAddress;

  if (!sourceAddress || !isBitcoinAddress(sourceAddress, network)) throw new Error('invalid_bitcoin_source_address');

  const { seed } = state.keyringService.exportMnemonic({
    address: account.address,
    walletEcosystem: meta.walletEcosystem,
  });

  if (!seed) throw new Error('bitcoin_mnemonic_unavailable');

  return {
    accountAddress: account.address,
    bitcoinAddress: meta.bitcoinAddress,
    bitcoinTestnetAddress: meta.bitcoinTestnetAddress,
    mnemonicOrSeed: seed,
    source: {
      address: sourceAddress,
      derivationPath: getBitcoinReceivePath(network),
    },
  };
}

export function normalizeRecipient(address: string, network: BitcoinNetworkKind): string {
  if (getBitcoinAddressNetwork(address) !== network) throw new Error('invalid_bitcoin_recipient');

  return address.toLowerCase();
}

export type {
  BitcoinDiscoveredTransferSources,
  BitcoinFeeEstimates,
  BitcoinOutpoint,
  BitcoinTransferClient,
  BitcoinTransferParams,
  BitcoinTransferSource,
};
