import { type BasicTxResponse } from '@extension-base/background/types/types';
import { IrohaToriiWalletClient } from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import { UNIVERSAL_WALLET_DERIVATION_PATHS, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { encodeIrohaI105Address, parseIrohaI105Address } from '@/util/iroha';

type HandleBasicTx = (data: BasicTxResponse) => void;
type IrohaNetworkKey = 'taira' | 'nexus';
const REVIEWED_LIVE_COMPATIBILITY = 'reviewed-live-torii-v4';

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

type IrohaWalletSmokeMetadata = Readonly<{
  evidence_role: 'wallet-smoke';
  route_governance_action_hash: string;
  wallet_platform: 'web';
  wallet_commit: string;
}>;

type IrohaTransferCodecInput = {
  amount: string;
  assetDefinitionId: string;
  authority: string;
  chainId: string;
  derivationPath: string;
  destinationAccountId: string;
  metadata?: IrohaWalletSmokeMetadata;
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

type IrohaTransferRoute = Pick<PreparedIrohaTransfer, 'chainId' | 'network' | 'toriiBaseUrl'> & {
  configuredToriiBaseUrl: string;
};

function isIrohaTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Iroha;
}

function isIrohaTransferEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true';
}

async function estimateIrohaTransferFee(params: IrohaTransferParams): Promise<string> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');
  assertIrohaLiveSubmissionSupported();

  prepareIrohaTransfer(params);

  throw new Error('iroha_transfer_fee_unavailable');
}

async function makeIrohaTransfer(params: IrohaTransferParams, codec?: IrohaTransferCodec): Promise<void> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');
  assertIrohaLiveSubmissionSupported();

  const prepared = prepareIrohaTransfer(params);

  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  return submitPreparedIrohaTransfer(params, prepared, codec);
}

async function makeIrohaWalletSmokeTransfer(
  params: IrohaTransferParams,
  routeGovernanceActionHash: string,
  walletCommit: string,
  codec?: IrohaTransferCodec
): Promise<void> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');
  assertIrohaLiveSubmissionSupported();

  const metadata = createIrohaWalletSmokeMetadata(routeGovernanceActionHash, walletCommit);
  const route = resolveIrohaTransferRoute(params);

  if (route.network !== 'nexus') throw new Error('iroha_wallet_smoke_requires_nexus');
  if (route.chainId !== UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId) {
    throw new Error('iroha_wallet_smoke_requires_canonical_nexus_chain');
  }
  if (route.configuredToriiBaseUrl !== UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.toriiBaseUrl) {
    throw new Error('iroha_wallet_smoke_requires_canonical_nexus_torii');
  }
  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  const prepared = prepareIrohaTransferForRoute(params, route);

  return submitPreparedIrohaTransfer(params, prepared, codec, metadata);
}

async function submitPreparedIrohaTransfer(
  params: IrohaTransferParams,
  prepared: PreparedIrohaTransfer,
  codec: IrohaTransferCodec,
  metadata?: IrohaWalletSmokeMetadata
): Promise<void> {
  assertIrohaLiveSubmissionSupported();

  const result = await codec.buildAndSignTransfer({
    amount: prepared.amount,
    assetDefinitionId: prepared.assetDefinitionId,
    authority: prepared.source.irohaAddress,
    chainId: prepared.chainId,
    derivationPath: prepared.source.derivationPath,
    destinationAccountId: prepared.destinationAccountId,
    ...(metadata ? { metadata } : {}),
    mnemonicOrSeed: prepared.source.mnemonicOrSeed,
    network: prepared.network,
    signingPublicKeyHex: prepared.source.publicKeyHex,
    sourceAccountId: prepared.source.irohaAddress,
    sourceAssetId: prepared.sourceAssetId,
  });
  const signedTransaction = normalizeSignedTransactionPayload(result.signedTransaction);
  const signedTransactionHash = normalizeSignedTransactionHash(result.signedTransactionHashHex);
  const client = new IrohaToriiWalletClient({ baseUrl: prepared.toriiBaseUrl, network: prepared.network });

  await client.submitTransactionAndWait(signedTransaction, signedTransactionHash);

  params.callback?.({ status: true });

  params.state.balanceService
    .fetchBalance({
      address: prepared.source.accountAddress,
      ethereumAddress: '',
      irohaAddress: prepared.source.irohaAddress,
      irohaNetworks: [prepared.networkKey],
      walletEcosystem: WalletEcosystem.Iroha,
    })
    .catch((error) => console.warn('Failed to refresh Iroha balance after transfer', error));

  console.info(`Iroha transfer applied: ${signedTransactionHash}`);
}

function assertIrohaLiveSubmissionSupported(): void {
  if (process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY !== REVIEWED_LIVE_COMPATIBILITY) {
    throw new Error('iroha_transfer_protocol_mismatch');
  }
}

function createIrohaWalletSmokeMetadata(
  routeGovernanceActionHash: string,
  walletCommit: string
): IrohaWalletSmokeMetadata {
  return normalizeIrohaWalletSmokeMetadata({
    evidence_role: 'wallet-smoke',
    route_governance_action_hash: routeGovernanceActionHash,
    wallet_platform: 'web',
    wallet_commit: walletCommit,
  });
}

function normalizeIrohaWalletSmokeMetadata(metadata: unknown): IrohaWalletSmokeMetadata {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('invalid_iroha_wallet_smoke_metadata');
  }

  const prototype = Object.getPrototypeOf(metadata);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('invalid_iroha_wallet_smoke_metadata');
  }

  const expectedKeys = [
    'evidence_role',
    'route_governance_action_hash',
    'wallet_platform',
    'wallet_commit',
  ] as const;
  const ownKeys = Reflect.ownKeys(metadata);

  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key as typeof expectedKeys[number]))
  ) {
    throw new Error('invalid_iroha_wallet_smoke_metadata');
  }

  const snapshot = Object.create(null) as Record<typeof expectedKeys[number], unknown>;

  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);

    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error('invalid_iroha_wallet_smoke_metadata');
    }
    snapshot[key] = descriptor.value;
  }

  if (
    snapshot.evidence_role !== 'wallet-smoke' ||
    snapshot.wallet_platform !== 'web' ||
    typeof snapshot.route_governance_action_hash !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(snapshot.route_governance_action_hash) ||
    /^sha256:0{64}$/u.test(snapshot.route_governance_action_hash) ||
    typeof snapshot.wallet_commit !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(snapshot.wallet_commit) ||
    /^0{40}$/u.test(snapshot.wallet_commit)
  ) {
    throw new Error('invalid_iroha_wallet_smoke_metadata');
  }

  return Object.freeze({
    evidence_role: snapshot.evidence_role,
    route_governance_action_hash: snapshot.route_governance_action_hash,
    wallet_platform: snapshot.wallet_platform,
    wallet_commit: snapshot.wallet_commit,
  });
}

function prepareIrohaTransfer(params: IrohaTransferParams): PreparedIrohaTransfer {
  return prepareIrohaTransferForRoute(params, resolveIrohaTransferRoute(params));
}

function resolveIrohaTransferRoute({ networkKey, state }: IrohaTransferParams): IrohaTransferRoute {
  const networkJson = state.networkService.networkMap[networkKey];

  if (!isIrohaTransferNetwork(networkJson)) throw new Error('unsupported_iroha_network');

  const network = getIrohaNetworkKey(networkJson);
  const configuredToriiBaseUrl = getConfiguredIrohaToriiBaseUrl(networkJson, network);
  const chainId = normalizeIrohaChainId(networkJson.chainId);

  if (!configuredToriiBaseUrl) throw new Error('iroha_network_unavailable');
  if (chainId !== UNIVERSAL_WALLET_IROHA_NETWORKS[network].chainId) {
    throw new Error('noncanonical_iroha_chain_id');
  }

  return {
    chainId,
    configuredToriiBaseUrl,
    network,
    toriiBaseUrl: normalizeIrohaToriiBaseUrl(configuredToriiBaseUrl),
  };
}

function prepareIrohaTransferForRoute(
  { amount, assetId, from, networkKey, state, to }: IrohaTransferParams,
  route: IrohaTransferRoute
): PreparedIrohaTransfer {
  const { chainId, network, toriiBaseUrl } = route;

  const source = resolveIrohaTransferSource(state, from, network);
  const destinationAccountId = normalizeIrohaRecipient(to, network);
  const normalizedAmount = normalizeIrohaTransferAmount(amount);
  const assetDefinitionId = normalizeIrohaAssetDefinitionId(assetId, network);

  return {
    amount: normalizedAmount,
    assetDefinitionId,
    chainId,
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
  const discriminantIsNexus = discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant;
  const discriminantIsTaira = discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant;
  const descriptorIsNexus = descriptor.includes('nexus');
  const descriptorIsTaira = descriptor.includes('taira') || descriptor.includes('testnet');

  if (discriminant !== undefined && discriminant !== null && !discriminantIsNexus && !discriminantIsTaira) {
    throw new Error('unsupported_iroha_network');
  }
  if ((discriminantIsNexus || descriptorIsNexus) && (discriminantIsTaira || descriptorIsTaira)) {
    throw new Error('ambiguous_iroha_network');
  }
  if (discriminantIsNexus || descriptorIsNexus) return 'nexus';
  if (discriminantIsTaira || descriptorIsTaira) return 'taira';

  throw new Error('unsupported_iroha_network');
}

function getIrohaToriiBaseUrl(network: NetworkJson, key: IrohaNetworkKey): string | null {
  const configuredUrl = getConfiguredIrohaToriiBaseUrl(network, key);

  return configuredUrl === null ? null : normalizeIrohaToriiBaseUrl(configuredUrl);
}

function getConfiguredIrohaToriiBaseUrl(network: NetworkJson, key: IrohaNetworkKey): string | null {
  const urls = [
    network.providers?.[network.currentProvider],
    network.customProviders?.[network.currentProvider],
    network.nodes?.[0]?.url,
    network.customNodes?.[0]?.url,
    network.externalApi?.history?.type === 'iroha' ? network.externalApi.history.url : '',
    UNIVERSAL_WALLET_IROHA_NETWORKS[key].toriiBaseUrl,
  ];

  return urls.find((url): url is string => typeof url === 'string' && url.length > 0) ?? null;
}

function normalizeIrohaToriiBaseUrl(value: string): string {
  if (!value || value !== value.trim()) throw new Error('invalid_iroha_torii_url');

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('invalid_iroha_torii_url');
  }

  const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';

  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('invalid_iroha_torii_url');
  }

  return url.toString().replace(/\/+$/u, '');
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

function normalizeIrohaAssetDefinitionId(assetId: string, network: IrohaNetworkKey = 'taira'): string {
  const valid = network === 'taira'
    ? /^[1-9A-HJ-NP-Za-km-z]{20,64}$/u.test(assetId)
    : /^[^\s%/?:#]+#[^\s%/?:#]+$/u.test(assetId);

  if (assetId !== assetId.trim() || !valid) {
    throw new Error('invalid_iroha_asset_id');
  }

  return assetId;
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

function normalizeSignedTransactionHash(value: string | undefined): string {
  if (typeof value !== 'string' || value !== value.trim()) throw new Error('invalid_iroha_transaction_hash');

  const normalized = value.replace(/^0x/u, '').toLowerCase();

  if (!/^[0-9a-f]{63}[13579bdf]$/u.test(normalized)) throw new Error('invalid_iroha_transaction_hash');

  return normalized;
}

export {
  assertIrohaLiveSubmissionSupported,
  createIrohaWalletSmokeMetadata,
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  getIrohaToriiBaseUrl,
  isIrohaTransferEnabled,
  isIrohaTransferNetwork,
  makeIrohaTransfer,
  makeIrohaWalletSmokeTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaToriiBaseUrl,
  normalizeIrohaWalletSmokeMetadata,
  normalizeIrohaTransferAmount,
  prepareIrohaTransfer,
  resolveIrohaTransferSource,
  type IrohaNetworkKey,
  type IrohaSignedTransaction,
  type IrohaTransferCodec,
  type IrohaTransferCodecInput,
  type IrohaTransferParams,
  type IrohaTransferSource,
  type IrohaWalletSmokeMetadata,
  type PreparedIrohaTransfer,
};
