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
  selectBitcoinFeeRateSatPerVbyte,
  sendBitcoinTransaction,
  type BitcoinSendClient,
  type BitcoinOutpoint,
  type BitcoinSendSource,
} from '@/util/bitcoinSend';
import { estimateP2wpkhTransactionVSize } from '@/util/bitcoinTransaction';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { isBitcoinTransfersEnabled } from '@/util/releaseFeatures';

const BITCOIN_DECIMALS = 8;
const MAX_SATOSHI = 2_100_000_000_000_000n;
const DEFAULT_ESTIMATE_INPUTS = 1;
const DEFAULT_ESTIMATE_OUTPUTS = 2;

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
type BitcoinTransferClient = BitcoinSendClient & BitcoinDiscoveryClient;
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
}: {
  client?: Pick<BitcoinEsploraClient, 'getFeeEstimates'>;
  network: BitcoinNetworkKind;
}): Promise<string> {
  if (!isBitcoinTransfersEnabled()) throw new Error('bitcoin_transfer_disabled');
  assertBitcoinTransferNetworkAllowed(network);

  const feeRateSatPerVbyte = selectBitcoinFeeRateSatPerVbyte(
    await (client ?? new BitcoinEsploraClient({ network })).getFeeEstimates()
  );
  const feeSat = Math.ceil(
    estimateP2wpkhTransactionVSize(DEFAULT_ESTIMATE_INPUTS, DEFAULT_ESTIMATE_OUTPUTS) * feeRateSatPerVbyte
  );

  return satsToBitcoinString(feeSat);
}

export async function makeBitcoinTransfer(
  params: BitcoinTransferParams,
  client?: BitcoinTransferClient,
  discoveryOptions: { gapLimit?: number; maxLookahead?: number } = {}
): Promise<void> {
  if (!isBitcoinTransfersEnabled()) throw new Error('bitcoin_transfer_disabled');

  const { amount, callback, networkKey, state, to } = params;
  const network = getBitcoinNetworkKind(state.networkService.networkMap[networkKey]);
  assertBitcoinTransferNetworkAllowed(network);
  const source = resolveBitcoinTransferSource(state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const amountSat = bitcoinAmountToSats(amount);
  const discovered = await discoverBitcoinTransferSources(source, network, indexer, discoveryOptions);

  const result = await sendBitcoinTransaction({
    amountSat,
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
  assertBitcoinTransferNetworkAllowed(network);
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

  const chainId = String(network.chainId ?? '');

  if (chainId === 'bitcoin:testnet') return 'testnet';
  if (chainId === 'bitcoin:mainnet') return 'mainnet';

  throw new Error('unsupported_bitcoin_network');
}

export function assertBitcoinTransferNetworkAllowed(network: BitcoinNetworkKind): void {
  if (
    process.env.VUE_APP_TRANSFER_TESTING === 'true' &&
    process.env.VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY !== 'testnet-only'
  ) {
    throw new Error('bitcoin_transfer_policy_invalid');
  }
  if (process.env.VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY === 'testnet-only' && network !== 'testnet') {
    throw new Error('bitcoin_transfer_testnet_only');
  }
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
