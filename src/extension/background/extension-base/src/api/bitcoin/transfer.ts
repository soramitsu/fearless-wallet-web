import { withLocalTransferLock } from '@extension-base/api/localTransferLock';
import { captureWalletResetGuard } from '@extension-base/api/walletResetGuard';
import { type BasicTxResponse, type ResponseBitcoinTransferQuote } from '@extension-base/background/types/types';
import {
  BitcoinBroadcastError,
  BitcoinEsploraClient,
  type BitcoinFeeEstimates,
} from '@extension-base/services/bitcoin-indexer-service';
import { assertSendCapability } from '@extension-base/services/send-kill-switch-service';
import { exportUniversalWalletSecret } from '@extension-base/services/keyring-service/UniversalWalletPassword';
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
  BitcoinTransactionStatusUnknownError,
  prepareBitcoinSend,
  quoteBitcoinSend,
  type BitcoinSendClient,
  type BitcoinOutpoint,
  type BitcoinSendSource,
} from '@/util/bitcoinSend';
import { WalletEcosystem, type NetworkName } from '@/interfaces';

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
  /** The wallet password when it opens this account; '' for every account the words alone open. */
  passphrase: string;
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

export async function estimateBitcoinTransferFee(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: DiscoveryOptions = {}
): Promise<{ fee: string; maxAmount?: string }> {
  let quote = await quoteBitcoinTransfer({ ...params, amount: params.sendMax ? '0' : params.amount }, client, discoveryOptions);
  if (params.sendMax) {
    quote = await quoteBitcoinTransfer({ ...params, amount: quote.maxSendable }, client, discoveryOptions);
  }
  if (quote.unavailableReason) throw new Error(quote.unavailableReason);
  return { fee: quote.fee, ...(params.sendMax ? { maxAmount: quote.maxSendable } : {}) };
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
  const discovered = await getQuoteDiscovery(params.state, source, network, indexer, discoveryOptions);
  const { inMempool, unresolved } = await loadPendingSends(pendingStore, source, network, indexer, params.state);
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

  // The earlier send the Send screen describes: one waiting in the mempool
  // blocks sending, an unknown one has its coins reused.
  const previous = latestPendingSend(inMempool) ?? latestPendingSend(unresolved);
  const unavailableReason = inMempool.length
    ? 'bitcoin_previous_send_unconfirmed'
    : quote.unavailableReason
      ? toBitcoinTransferErrorCode(quote.unavailableReason)
      : undefined;
  const blockedByPreviousSend =
    unavailableReason === 'bitcoin_previous_send_pending' || unavailableReason === 'bitcoin_previous_send_unconfirmed';

  return {
    awaitingConfirmation: satsToBitcoinString(quote.awaitingConfirmationSat),
    fee: satsToBitcoinString(quote.feeSat ?? 0),
    feeRateSatPerVbyte: quote.feeRateSatPerVbyte,
    maxSendable: satsToBitcoinString(quote.maxSendableSat),
    // Claimed only while the coins really are reused, not when a missing coin
    // or a send waiting in the mempool rules out sending.
    pendingPreviousSend: unresolved.length > 0 && !blockedByPreviousSend,
    previousSend: previous && {
      amount:
        Number.isSafeInteger(previous.amountSat) && previous.amountSat > 0
          ? satsToBitcoinString(previous.amountSat)
          : undefined,
      inMempool: inMempool.includes(previous),
      recipient: typeof previous.recipient === 'string' ? previous.recipient : undefined,
      txid: previous.txid,
    },
    recipientType: decodeBitcoinRecipient(params.to, network)?.type,
    spendable: satsToBitcoinString(quote.spendableSat),
    unavailableReason,
    vsize: quote.vsize,
  };
}

export async function makeBitcoinTransfer(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: DiscoveryOptions = {},
  pendingStore: BitcoinPendingSendStore = getDefaultBitcoinPendingSendStore()
): Promise<void> {
  const assertCurrent = captureWalletResetGuard(params.state);
  await assertSendCapability(params.state, 'bitcoinSend');
  if (typeof params.approvedMaxFee !== 'string') throw new Error('transfer_fee_approval_required');
  const approvedMaxFeeSat = bitcoinAmountToSats(params.approvedMaxFee);
  assertCurrent();

  const { amount, callback, networkKey, state, to } = params;
  const network = getBitcoinNetworkKind(state.networkService.networkMap[networkKey]);
  const source = resolveBitcoinTransferSource(state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const amountSat = bitcoinAmountToSats(amount);
  const recipient = normalizeRecipient(to, network);
  invalidateQuoteDiscovery(state, source.accountAddress, network);
  return withLocalTransferLock(`bitcoin:${network}:${source.source.address}`, 'bitcoin_previous_send_pending', async () => {
    const discovered = await discoverBitcoinTransferSources(source, network, indexer, discoveryOptions);
    const { inMempool, unresolved } = await loadPendingSends(pendingStore, source, network, indexer, params.state);

    // Its coins are spent in the mempool, so no new transaction could conflict
    // with it: nothing new is signed until it confirms.
    if (inMempool.length) throw new Error('bitcoin_previous_send_unconfirmed');

    assertCurrent();
    const prepared = await prepareBitcoinSend({
      assertCurrent,
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
      passphrase: source.passphrase,
      requiredOutpoints: unresolved.flatMap(({ outpoints }) => outpoints),
      selectedOutpoints: params.bitcoinSelectedOutpoints,
      sources: discovered.sources,
      toAddress: recipient,
    }).catch((error: unknown) => {
      throw error instanceof BitcoinSendError ? new Error(toBitcoinTransferErrorCode(error.code), { cause: error }) : error;
    });

    assertCurrent();
    // Recorded before broadcast: a service worker stopped mid-request must still
    // find this transaction on the next send.
    await pendingStore.save({
      accountAddress: source.accountAddress,
      senderAddress: source.source.address,
      amountSat,
      createdAt: Date.now(),
      network,
      outpoints: prepared.selectedUtxos.map(({ txid, vout }) => ({ txid, vout })),
      recipient,
      txHex: prepared.txHex,
      txid: prepared.txid,
    });

    // Preserve the durable record on cancellation. Identical bytes may already
    // have been submitted by an earlier attempt; reset cannot prove otherwise.
    assertCurrent();
    let broadcastTxid: string;

    try {
      broadcastTxid = await indexer.broadcastTransaction(prepared.txHex, prepared.txid, assertCurrent);
    } catch (error) {
      if (error instanceof BitcoinBroadcastError && !error.ambiguous) {
        // Every endpoint answered with a definite rejection: nothing was relayed.
        if (!unresolved.some(({ txid }) => txid === prepared.txid)) {
          await pendingStore.remove([prepared.txid], network);
        }
        throw new Error('bitcoin_broadcast_rejected', { cause: error });
      }

      throw new BitcoinTransactionStatusUnknownError(prepared.txid, 'bitcoin_broadcast_ambiguous');
    }

    if (broadcastTxid !== prepared.txid) throw new BitcoinTransactionStatusUnknownError(prepared.txid, 'bitcoin_broadcast_ambiguous');

    // An earlier unresolved send whose coins the new transaction spends again can
    // no longer confirm alongside it. Coin selection requires all of them, but
    // only what was actually spent is forgotten.
    const spent = new Set(prepared.selectedUtxos.map(({ txid, vout }) => `${txid.toLowerCase()}:${vout}`));
    const conflicting = unresolved.filter(({ outpoints }) =>
      outpoints.every(({ txid, vout }) => spent.has(`${txid.toLowerCase()}:${vout}`))
    );

    await pendingStore.remove([prepared.txid, ...conflicting.map(({ txid }) => txid)], network)
      .catch((error: unknown) => console.warn('Failed to clear a settled Bitcoin pending send', error));
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
  }).finally(() => invalidateQuoteDiscovery(state, source.accountAddress, network));
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
    passphrase: source.passphrase,
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
    passphrase: source.passphrase,
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

const QUOTE_DISCOVERY_TTL_MS = 30_000;
const MAX_QUOTE_DISCOVERY_ENTRIES = 32;
type QuoteDiscoveryEntry = {
  accountAddress: string;
  network: BitcoinNetworkKind;
  expiresAt: number;
  result: Promise<BitcoinDiscoveredTransferSources>;
};
// Only public discovery results are retained, scoped to the wallet state. UTXOs and fees are never cached.
let quoteDiscoveryCache = new WeakMap<State, Map<string, QuoteDiscoveryEntry>>();

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

export function invalidateBitcoinQuoteCache(_accountAddress?: string, _network?: BitcoinNetworkKind): void {
  quoteDiscoveryCache = new WeakMap();
}

// Forgets the account's pending sends whose outcome is proven and returns the
// ones still in the mempool or unknown.
async function loadPendingSends(
  store: BitcoinPendingSendStore,
  source: BitcoinTransferSource,
  network: BitcoinNetworkKind,
  client: Partial<BitcoinPendingSendClient>,
  state: State
): Promise<{ inMempool: BitcoinPendingSend[]; unresolved: BitcoinPendingSend[] }> {
  const accounts = state.keyringService.getAllAccounts();
  const senderOf = (record: BitcoinPendingSend): string | undefined => {
    const account = accounts.find(({ address }) => address === record.accountAddress);
    const legacyAddress = account && (network === 'mainnet' ? account.meta.bitcoinAddress : account.meta.bitcoinTestnetAddress);
    const address = record.senderAddress ?? legacyAddress ??
      (record.accountAddress === source.accountAddress ? source.source.address : undefined);
    return typeof address === 'string' && isBitcoinAddress(address, network) ? normalizeRecipient(address, network) : undefined;
  };
  const records = (await store.list()).filter(record =>
    record.network === network && (senderOf(record) === undefined || senderOf(record) === source.source.address)
  );
  const unknownOwner = (record: BitcoinPendingSend) => senderOf(record) === undefined;

  if (!records.length) return { inMempool: [], unresolved: [] };
  if (!client.getTransactionStatus || !client.getOutspend) {
    if (records.some(unknownOwner)) throw new Error('bitcoin_previous_send_pending');
    return { inMempool: [], unresolved: records };
  }

  const { inMempool, resolved, unresolved } = await resolveBitcoinPendingSends(
    records,
    client as BitcoinPendingSendClient
  );

  if (resolved.length) await store.remove(resolved.map(({ txid }) => txid), network);
  // A removed legacy account may leave no recoverable root identity. Resolve
  // its public chain outcome, but never assume an unknown record is unrelated.
  if ([...inMempool, ...unresolved].some(unknownOwner)) throw new Error('bitcoin_previous_send_pending');

  return { inMempool, unresolved };
}

function latestPendingSend(records: BitcoinPendingSend[]): BitcoinPendingSend | undefined {
  return records.reduce<BitcoinPendingSend | undefined>(
    (latest, record) => (!latest || record.createdAt > latest.createdAt ? record : latest),
    undefined
  );
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

  const { seed, passphrase } = exportUniversalWalletSecret(
    state.keyringService,
    { address: account.address, walletEcosystem: meta.walletEcosystem },
    network === 'testnet' ? 'bitcoinTestnet' : 'bitcoin',
    meta
  );

  if (!seed) throw new Error('bitcoin_mnemonic_unavailable');

  return {
    accountAddress: account.address,
    bitcoinAddress: meta.bitcoinAddress,
    bitcoinTestnetAddress: meta.bitcoinTestnetAddress,
    mnemonicOrSeed: seed,
    passphrase,
    source: {
      address: normalizeRecipient(sourceAddress, network),
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
