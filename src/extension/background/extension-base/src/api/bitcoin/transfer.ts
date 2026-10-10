import { type BasicTxResponse, type ResponseBitcoinTransferQuote } from '@extension-base/background/types/types';
import {
  BitcoinBroadcastError,
  BitcoinEsploraClient,
  type BitcoinFeeEstimates,
} from '@extension-base/services/bitcoin-indexer-service';
import { assertSendCapability } from '@extension-base/services/send-kill-switch-service';
import {
  getDefaultBitcoinPendingSendStore,
  resolveBitcoinPendingSends,
  type BitcoinPendingSend,
  type BitcoinPendingSendClient,
  type BitcoinPendingSendStore,
} from './pendingSends';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { decodeBitcoinRecipient, isBitcoinAddress, type BitcoinNetworkKind } from '@/util/bitcoin';
import { getBitcoinReceivePath } from '@/util/bitcoinKeyring';
import {
  discoverBitcoinWalletAddresses,
  type BitcoinDiscoveryClient,
  type BitcoinWalletDiscoveryResult,
} from '@/util/bitcoinDiscovery';
import {
  BitcoinSendError,
  prepareBitcoinSend,
  quoteBitcoinSend,
  selectBitcoinFeeRateSatPerVbyte,
  type BitcoinSendClient,
  type BitcoinOutpoint,
  type BitcoinSendSource,
} from '@/util/bitcoinSend';
import { estimateP2wpkhTransactionVSize } from '@/util/bitcoinTransaction';
import { WalletEcosystem, type NetworkName } from '@/interfaces';

const BITCOIN_DECIMALS = 8;
const MAX_SATOSHI = 2_100_000_000_000_000n;
const DEFAULT_ESTIMATE_INPUTS = 1;
const DEFAULT_ESTIMATE_OUTPUTS = 2;
// Address discovery queries dozens of addresses; a quote refreshes at most this
// often while the user edits the amount. Sends always discover afresh.
const QUOTE_DISCOVERY_TTL_MS = 60_000;

type HandleBasicTx = (data: BasicTxResponse) => void;

type BitcoinTransferParams = {
  amount: string;
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
type BitcoinTransferClient = BitcoinSendClient & BitcoinDiscoveryClient & Partial<BitcoinPendingSendClient>;
type BitcoinQuoteClient = Pick<BitcoinEsploraClient, 'getFeeEstimates' | 'getUtxos'> &
  BitcoinDiscoveryClient &
  Partial<BitcoinPendingSendClient>;
type DiscoveryOptions = { gapLimit?: number; maxLookahead?: number };
type BitcoinDiscoveredTransferSources = {
  changeAddress: string;
  discovery: BitcoinWalletDiscoveryResult;
  sources: BitcoinSendSource[];
};

export function isBitcoinTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Bitcoin;
}

export async function estimateBitcoinTransferFee({
  client,
  network,
  state = {},
}: {
  client?: Pick<BitcoinEsploraClient, 'getFeeEstimates'>;
  network: BitcoinNetworkKind;
  state?: Parameters<typeof assertSendCapability>[0];
}): Promise<string> {
  await assertSendCapability(state, 'bitcoinSend');

  const feeRateSatPerVbyte = selectBitcoinFeeRateSatPerVbyte(
    await (client ?? new BitcoinEsploraClient({ network })).getFeeEstimates()
  );
  const feeSat = Math.ceil(
    estimateP2wpkhTransactionVSize(DEFAULT_ESTIMATE_INPUTS, DEFAULT_ESTIMATE_OUTPUTS) * feeRateSatPerVbyte
  );

  return satsToBitcoinString(feeSat);
}

/**
 * Fee, spendable balance and the largest sendable amount for the Send screen.
 * Without an amount (or with `0`) only the fee rate and balances are quoted.
 */
export async function quoteBitcoinTransfer(
  params: Omit<BitcoinTransferParams, 'callback'>,
  client?: BitcoinQuoteClient,
  discoveryOptions: DiscoveryOptions = {},
  pendingStore: BitcoinPendingSendStore = getDefaultBitcoinPendingSendStore()
): Promise<ResponseBitcoinTransferQuote> {
  await assertSendCapability(params.state, 'bitcoinSend');

  const network = getBitcoinNetworkKind(params.state.networkService.networkMap[params.networkKey]);
  const source = resolveBitcoinTransferSource(params.state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const discovered = await discoverCachedBitcoinTransferSources(source, network, indexer, discoveryOptions);
  const unresolved = await loadUnresolvedPendingSends(pendingStore, source.accountAddress, network, indexer);
  const amountSat = optionalBitcoinAmountToSats(params.amount);
  const quote = await quoteBitcoinSend({
    amountSat,
    client: indexer,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    network,
    requiredOutpoints: unresolved.flatMap(({ outpoints }) => outpoints),
    sources: discovered.sources,
    toAddress: params.to,
  });

  return {
    awaitingConfirmation: satsToBitcoinString(quote.awaitingConfirmationSat),
    fee: satsToBitcoinString(quote.feeSat ?? 0),
    feeRateSatPerVbyte: quote.feeRateSatPerVbyte,
    maxSendable: satsToBitcoinString(quote.maxSendableSat),
    pendingPreviousSend: unresolved.length > 0,
    recipientType: decodeBitcoinRecipient(params.to, network)?.type,
    spendable: satsToBitcoinString(quote.spendableSat),
    unavailableReason: quote.unavailableReason ? toBitcoinTransferErrorCode(quote.unavailableReason) : undefined,
    vsize: quote.vsize,
  };
}

export async function makeBitcoinTransfer(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: DiscoveryOptions = {},
  pendingStore: BitcoinPendingSendStore = getDefaultBitcoinPendingSendStore()
): Promise<void> {
  await assertSendCapability(params.state, 'bitcoinSend');

  const { amount, callback, networkKey, state, to } = params;
  const network = getBitcoinNetworkKind(state.networkService.networkMap[networkKey]);
  const source = resolveBitcoinTransferSource(state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const amountSat = bitcoinAmountToSats(amount);
  const recipient = normalizeRecipient(to, network);
  const discovered = await discoverBitcoinTransferSources(source, network, indexer, discoveryOptions);
  const unresolved = await loadUnresolvedPendingSends(pendingStore, source.accountAddress, network, indexer);

  const prepared = await prepareBitcoinSend({
    amountSat,
    changeAddress: discovered.changeAddress,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    client: indexer,
    mnemonicOrSeed: source.mnemonicOrSeed,
    network,
    requiredOutpoints: unresolved.flatMap(({ outpoints }) => outpoints),
    selectedOutpoints: params.bitcoinSelectedOutpoints,
    sources: discovered.sources,
    toAddress: recipient,
  }).catch((error: unknown) => {
    throw error instanceof BitcoinSendError ? new Error(toBitcoinTransferErrorCode(error.code), { cause: error }) : error;
  });

  // Recorded before broadcast: a service worker stopped mid-request must still
  // find this transaction on the next send.
  await pendingStore.save({
    accountAddress: source.accountAddress,
    amountSat,
    createdAt: Date.now(),
    network,
    outpoints: prepared.selectedUtxos.map(({ txid, vout }) => ({ txid, vout })),
    recipient,
    txHex: prepared.txHex,
    txid: prepared.txid,
  });

  let broadcastTxid: string;

  try {
    broadcastTxid = await indexer.broadcastTransaction(prepared.txHex, prepared.txid);
  } catch (error) {
    if (error instanceof BitcoinBroadcastError && !error.ambiguous) {
      // Every endpoint answered with a definite rejection: nothing was relayed.
      await pendingStore.remove([prepared.txid]);
      throw new Error('bitcoin_broadcast_rejected', { cause: error });
    }

    throw new Error('bitcoin_broadcast_ambiguous', { cause: error });
  }

  if (broadcastTxid !== prepared.txid) throw new Error('bitcoin_broadcast_ambiguous');

  // The new transaction spends every coin of the earlier unresolved ones, so
  // those can no longer confirm.
  await pendingStore.remove([prepared.txid, ...unresolved.map(({ txid }) => txid)]);
  invalidateBitcoinQuoteCache(source.accountAddress, network);

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

  console.info(`Bitcoin transfer broadcast: ${broadcastTxid}`);
}

export async function prepareBitcoinTransferForTest(
  params: BitcoinTransferParams,
  client: BitcoinTransferClient,
  discoveryOptions: DiscoveryOptions = {}
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
  options: DiscoveryOptions = {}
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

const quoteDiscoveryCache = new Map<string, { expiresAt: number; value: Promise<BitcoinDiscoveredTransferSources> }>();

function discoverCachedBitcoinTransferSources(
  source: BitcoinTransferSource,
  network: BitcoinNetworkKind,
  client: BitcoinDiscoveryClient,
  options: DiscoveryOptions
): Promise<BitcoinDiscoveredTransferSources> {
  const key = `${source.accountAddress}:${network}`;
  const cached = quoteDiscoveryCache.get(key);

  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = discoverBitcoinTransferSources(source, network, client, options);

  quoteDiscoveryCache.set(key, { expiresAt: Date.now() + QUOTE_DISCOVERY_TTL_MS, value });
  value.catch(() => quoteDiscoveryCache.delete(key));

  return value;
}

export function invalidateBitcoinQuoteCache(accountAddress?: string, network?: BitcoinNetworkKind): void {
  if (accountAddress === undefined) quoteDiscoveryCache.clear();
  else quoteDiscoveryCache.delete(`${accountAddress}:${network}`);
}

async function loadUnresolvedPendingSends(
  store: BitcoinPendingSendStore,
  accountAddress: string,
  network: BitcoinNetworkKind,
  client: Partial<BitcoinPendingSendClient>
): Promise<BitcoinPendingSend[]> {
  const records = (await store.list()).filter(
    (record) => record.accountAddress === accountAddress && record.network === network
  );

  if (!records.length) return [];
  if (!client.getTransactionStatus || !client.getOutspend) return records;

  const { resolved, unresolved } = await resolveBitcoinPendingSends(records, client as BitcoinPendingSendClient);

  if (resolved.length) await store.remove(resolved.map(({ txid }) => txid));

  return unresolved;
}

// Send-preparation failures the Send screen explains; anything else stays a
// generic failure.
const BITCOIN_TRANSFER_ERROR_CODES: Readonly<Record<string, string>> = Object.freeze({
  amount_below_dust: 'bitcoin_amount_below_dust',
  insufficient_funds: 'bitcoin_insufficient_spendable',
  invalid_recipient_address: 'invalid_bitcoin_recipient',
  no_spendable_utxos: 'bitcoin_insufficient_spendable',
  pending_outpoint_required: 'bitcoin_previous_send_pending',
  too_many_inputs_required: 'bitcoin_too_many_inputs',
});

function toBitcoinTransferErrorCode(code: string): string {
  return BITCOIN_TRANSFER_ERROR_CODES[code] ?? `bitcoin_${code}`;
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

function optionalBitcoinAmountToSats(amount: string | undefined): number | undefined {
  if (amount === undefined || /^\s*0*(?:\.0*)?\s*$/u.test(amount)) return undefined;

  return bitcoinAmountToSats(amount);
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

// Bech32 addresses may be written in upper case (QR codes); Base58 addresses
// are case-sensitive and are passed through unchanged.
export function normalizeRecipient(address: string, network: BitcoinNetworkKind): string {
  const recipient = decodeBitcoinRecipient(address, network);

  if (!recipient) throw new Error('invalid_bitcoin_recipient');

  return recipient.type === 'p2pkh' || recipient.type === 'p2sh' ? address : address.toLowerCase();
}

export type {
  BitcoinDiscoveredTransferSources,
  BitcoinFeeEstimates,
  BitcoinOutpoint,
  BitcoinTransferClient,
  BitcoinTransferParams,
  BitcoinTransferSource,
};
