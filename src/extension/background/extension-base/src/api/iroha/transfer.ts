import { type BasicTxResponse } from '@extension-base/background/types/types';
import { IrohaToriiWalletClient } from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_DERIVATION_PATHS, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { encodeIrohaI105Address, parseIrohaI105Address } from '@/util/iroha';

type HandleBasicTx = (data: BasicTxResponse) => void;
type IrohaNetworkKey = 'taira' | 'nexus';

type IrohaTransferParams = {
  amount: string;
  assetId: string;
  callback?: HandleBasicTx;
  from: string;
  networkKey: NetworkName;
  state: State;
  to: string;
};

type IrohaTransferSource = {
  accountAddress: string;
  derivationPath: string;
  irohaAddress: string;
  mnemonicOrSeed: string;
  publicKeyHex: string;
  walletEcosystem?: WalletEcosystem;
};

type IrohaTransferCodecInput = {
  amount: string;
  assetDefinitionId: string;
  authority: string;
  chainId: string;
  derivationPath: string;
  destinationAccountId: string;
  mnemonicOrSeed: string;
  network: IrohaNetworkKey;
  signingPublicKeyHex: string;
  sourceAccountId: string;
  sourceAssetId: string;
};

type IrohaSignedTransaction = {
  signedTransaction: ArrayBuffer | ArrayBufferView | string;
  signedTransactionHashHex?: string;
};

type IrohaTransferCodec = {
  buildAndSignTransfer(input: IrohaTransferCodecInput): Promise<IrohaSignedTransaction>;
};

type PreparedIrohaTransfer = {
  amount: string;
  assetDefinitionId: string;
  chainId: string;
  destinationAccountId: string;
  network: IrohaNetworkKey;
  networkKey: NetworkName;
  source: IrohaTransferSource;
  sourceAssetId: string;
  toriiBaseUrl: string;
};

function isIrohaTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Iroha;
}

function isIrohaTransferEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true';
}

async function estimateIrohaTransferFee(params: IrohaTransferParams): Promise<string> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');

  prepareIrohaTransfer(params);

  return '0';
}

async function makeIrohaTransfer(params: IrohaTransferParams, codec?: IrohaTransferCodec): Promise<void> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');

  const prepared = prepareIrohaTransfer(params);

  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  const result = await codec.buildAndSignTransfer({
    amount: prepared.amount,
    assetDefinitionId: prepared.assetDefinitionId,
    authority: prepared.source.irohaAddress,
    chainId: prepared.chainId,
    derivationPath: prepared.source.derivationPath,
    destinationAccountId: prepared.destinationAccountId,
    mnemonicOrSeed: prepared.source.mnemonicOrSeed,
    network: prepared.network,
    signingPublicKeyHex: prepared.source.publicKeyHex,
    sourceAccountId: prepared.source.irohaAddress,
    sourceAssetId: prepared.sourceAssetId,
  });
  const signedTransaction = normalizeSignedTransactionPayload(result.signedTransaction);
  const client = new IrohaToriiWalletClient({ baseUrl: prepared.toriiBaseUrl, network: prepared.network });

  await client.submitTransaction(signedTransaction);

  params.callback?.({ status: true });

  setTimeout(() => {
    params.state.balanceService
      .fetchBalance({
        address: prepared.source.accountAddress,
        ethereumAddress: '',
        irohaAddress: prepared.source.irohaAddress,
        irohaNetworks: [prepared.networkKey],
        walletEcosystem: WalletEcosystem.Iroha,
      })
      .catch((error) => console.warn('Failed to refresh Iroha balance after transfer', error));
  }, 8000);

  console.info(`Iroha transfer broadcast${result.signedTransactionHashHex ? `: ${result.signedTransactionHashHex}` : ''}`);
}

function prepareIrohaTransfer({ amount, assetId, from, networkKey, state, to }: IrohaTransferParams): PreparedIrohaTransfer {
  const networkJson = state.networkService.networkMap[networkKey];

  if (!isIrohaTransferNetwork(networkJson)) throw new Error('unsupported_iroha_network');

  const network = getIrohaNetworkKey(networkJson);
  const toriiBaseUrl = getIrohaToriiBaseUrl(networkJson, network);

  if (!toriiBaseUrl) throw new Error('iroha_network_unavailable');

  const source = resolveIrohaTransferSource(state, from, network);
  const destinationAccountId = normalizeIrohaRecipient(to, network);
  const normalizedAmount = normalizeIrohaTransferAmount(amount);
  const assetDefinitionId = normalizeIrohaAssetDefinitionId(assetId);

  return {
    amount: normalizedAmount,
    assetDefinitionId,
    chainId: normalizeIrohaChainId(networkJson.chainId),
    destinationAccountId,
    network,
    networkKey,
    source,
    sourceAssetId: `${assetDefinitionId}#${source.irohaAddress}`,
    toriiBaseUrl,
  };
}

function resolveIrohaTransferSource(state: State, from: string, network: IrohaNetworkKey): IrohaTransferSource {
  const account = state.keyringService.getAllAccounts().find(({ address, meta }) => {
    const { irohaAddress } = meta as FWKeyringMeta;

    return address === from || irohaAddress?.toLowerCase() === from.toLowerCase();
  });

  if (!account) throw new Error('iroha_account_not_found');

  const meta = account.meta as FWKeyringMeta;
  const irohaAddress = resolveIrohaAccountAddress(meta, account.address, network);
  const details = parseIrohaI105Address(irohaAddress, network);
  const { seed } = state.keyringService.exportMnemonic({
    address: account.address,
    walletEcosystem: meta.walletEcosystem,
  });

  if (!seed) throw new Error('iroha_mnemonic_unavailable');

  return {
    accountAddress: account.address,
    derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
    irohaAddress: details.i105,
    mnemonicOrSeed: seed,
    publicKeyHex: details.publicKeyHex,
    walletEcosystem: meta.walletEcosystem,
  };
}

function resolveIrohaAccountAddress(meta: FWKeyringMeta, fallbackAddress: string, network: IrohaNetworkKey): string {
  if (meta.irohaPublicKeyHex) return encodeIrohaI105Address(meta.irohaPublicKeyHex, network);

  return meta.irohaAddress ?? fallbackAddress;
}

function getIrohaNetworkKey(network: NetworkJson): IrohaNetworkKey {
  const discriminant = (network as { chainDiscriminant?: unknown; i105Prefix?: unknown }).chainDiscriminant ??
    (network as { i105Prefix?: unknown }).i105Prefix;
  const descriptor = [network.chainId, network.name, network.key, ...(network.options ?? [])].join(' ').toLowerCase();

  if (discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant || descriptor.includes('nexus')) {
    return 'nexus';
  }

  if (
    discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant ||
    descriptor.includes('taira') ||
    descriptor.includes('testnet')
  ) {
    return 'taira';
  }

  return 'nexus';
}

function getIrohaToriiBaseUrl(network: NetworkJson, key: IrohaNetworkKey): string | null {
  const urls = [
    network.providers?.[network.currentProvider],
    network.customProviders?.[network.currentProvider],
    network.nodes?.[0]?.url,
    network.customNodes?.[0]?.url,
    network.externalApi?.history?.type === 'iroha' ? network.externalApi.history.url : '',
    UNIVERSAL_WALLET_IROHA_NETWORKS[key].toriiBaseUrl,
  ];

  return urls.find((url): url is string => typeof url === 'string' && url.trim().length > 0)?.trim() ?? null;
}

function normalizeIrohaRecipient(address: string, network: IrohaNetworkKey): string {
  return parseIrohaI105Address(address, network).i105;
}

function normalizeIrohaTransferAmount(amount: string): string {
  if (amount !== amount.trim()) throw new Error('invalid_iroha_amount');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,28})?$/u.test(amount)) throw new Error('invalid_iroha_amount');

  const [whole, fraction = ''] = amount.split('.');

  if (BigInt(whole) === 0n && /^0*$/u.test(fraction)) throw new Error('invalid_iroha_amount');

  return amount;
}

function normalizeIrohaAssetDefinitionId(assetId: string): string {
  const normalized = assetId.trim();

  if (normalized !== assetId || !/^[^\s%/?:#]+#[^\s%/?:#]+$/u.test(normalized)) {
    throw new Error('invalid_iroha_asset_id');
  }

  return normalized;
}

function normalizeIrohaChainId(chainId: string): string {
  const normalized = chainId.trim();

  if (!normalized || normalized !== chainId) throw new Error('invalid_iroha_chain_id');

  return normalized;
}

function normalizeSignedTransactionPayload(payload: ArrayBuffer | ArrayBufferView | string): BodyInit {
  if (typeof payload === 'string') return hexToArrayBuffer(payload);
  if (payload instanceof ArrayBuffer && payload.byteLength > 0) return payload;
  if (ArrayBuffer.isView(payload) && payload.byteLength > 0) return payload as BodyInit;

  throw new Error('invalid_iroha_signed_transaction');
}

function hexToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;

  if (!/^[0-9a-fA-F]+$/u.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('invalid_iroha_signed_transaction');
  }

  const buffer = new ArrayBuffer(normalized.length / 2);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < normalized.length; i += 2) {
    bytes[i / 2] = Number.parseInt(normalized.slice(i, i + 2), 16);
  }

  return buffer;
}

export {
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  getIrohaToriiBaseUrl,
  isIrohaTransferEnabled,
  isIrohaTransferNetwork,
  makeIrohaTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaTransferAmount,
  prepareIrohaTransfer,
  resolveIrohaTransferSource,
  type IrohaNetworkKey,
  type IrohaSignedTransaction,
  type IrohaTransferCodec,
  type IrohaTransferCodecInput,
  type IrohaTransferParams,
  type IrohaTransferSource,
  type PreparedIrohaTransfer,
};
