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
  prepareBitcoinSend,
  selectBitcoinFeeRateSatPerVbyte,
  sendBitcoinTransaction,
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
  client?: BitcoinSendClient
): Promise<void> {
  const { amount, callback, networkKey, state, to } = params;
  const network = getBitcoinNetworkKind(state.networkService.networkMap[networkKey]);
  const source = resolveBitcoinTransferSource(state, params.from, network);
  const indexer = client ?? new BitcoinEsploraClient({ network });
  const amountSat = bitcoinAmountToSats(amount);

  const result = await sendBitcoinTransaction({
    amountSat,
    changeAddress: source.source.address,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    client: indexer,
    mnemonicOrSeed: source.mnemonicOrSeed,
    network,
    selectedOutpoints: params.bitcoinSelectedOutpoints,
    sources: [source.source],
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
  client: BitcoinSendClient
): Promise<Awaited<ReturnType<typeof prepareBitcoinSend>>> {
  const network = getBitcoinNetworkKind(params.state.networkService.networkMap[params.networkKey]);
  const source = resolveBitcoinTransferSource(params.state, params.from, network);

  return prepareBitcoinSend({
    amountSat: bitcoinAmountToSats(params.amount),
    changeAddress: source.source.address,
    client,
    feeRateSatPerVbyte: params.bitcoinFeeRateSatPerVbyte,
    feeTargetBlocks: params.bitcoinFeeTargetBlocks,
    includeUnconfirmed: params.bitcoinIncludeUnconfirmed,
    maxInputs: params.bitcoinMaxInputs,
    mnemonicOrSeed: source.mnemonicOrSeed,
    network,
    selectedOutpoints: params.bitcoinSelectedOutpoints,
    sources: [source.source],
    toAddress: normalizeRecipient(params.to, network),
  });
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

export type { BitcoinFeeEstimates, BitcoinOutpoint, BitcoinTransferParams, BitcoinTransferSource };
