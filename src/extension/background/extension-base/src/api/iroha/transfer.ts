import { type BasicTxResponse } from '@extension-base/background/types/types';
import { IrohaToriiWalletClient } from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta, NetworkJson } from '@extension-base/types';
import {
  IROHA_TRANSACTION_WIRE,
  UNIVERSAL_WALLET_DERIVATION_PATHS,
  UNIVERSAL_WALLET_IROHA_NETWORKS,
} from '@/consts/universalWallet';
import { WalletEcosystem, type NetworkName } from '@/interfaces';
import { encodeIrohaI105Address, parseIrohaI105Address } from '@/util/iroha';
import {
  addIrohaQuantities,
  canonicalizeIrohaQuantity,
  compareIrohaQuantities,
  getIrohaQuantityScale,
  multiplyIrohaQuantity,
} from '@/util/irohaQuantity';

type HandleBasicTx = (data: BasicTxResponse) => void;
type IrohaNetworkKey = 'taira' | 'nexus';

// A transaction that has not applied by creation time + TTL can never apply, so waiting
// past the TTL gives a definitive answer instead of an ambiguous one.
const IROHA_TRANSFER_TTL_MS = 60_000;
const IROHA_TRANSFER_WAIT_MS = IROHA_TRANSFER_TTL_MS + 30_000;
// Fixed native gas for one asset transfer (iroha_core `gas::BASE_TRANSFER`).
const IROHA_TRANSFER_GAS_UNITS = 180;
const IROHA_TRANSFER_INSTRUCTIONS = 1;
const MAX_FEE_REFINEMENTS = 4;
const MAX_BALANCE_PAGES = 10;

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
  authority: string;
  creationTimeMs: number;
  derivationPath: string;
  destinationAccountId: string;
  feeAssetDefinitionId: string;
  maxFee: string;
  mnemonicOrSeed: string;
  networkId: string;
  networkPrefix: number;
  signingPublicKeyHex: string;
  sourceAssetId: string;
  ttlMs: number;
};

type IrohaSignedTransaction = {
  signedTransaction: Uint8Array;
  signedTransactionHashHex: string;
};

type IrohaTransferCodec = {
  buildAndSignTransfer(input: IrohaTransferCodecInput): Promise<IrohaSignedTransaction>;
};

// Counts the bytes Torii charges per-byte fees on for an unsigned transfer.
type IrohaTransferFrameSizer = (input: Omit<IrohaTransferCodecInput, 'derivationPath' | 'mnemonicOrSeed'>) => number;

type PreparedIrohaTransfer = {
  amount: string;
  assetDefinitionId: string;
  destinationAccountId: string;
  network: IrohaNetworkKey;
  networkKey: NetworkName;
  source: IrohaTransferSource;
  sourceAssetId: string;
  toriiBaseUrl: string;
};

type IrohaFeeSchedule = {
  assetDefinitionId: string;
  baseFee: string;
  perByteFee: string;
  perGasUnitFee: string;
  perInstructionFee: string;
};

type IrohaTransferQuote = {
  fee: string;
  feeAssetDefinitionId: string;
  networkId: string;
  networkPrefix: number;
};

function isIrohaTransferNetwork(network: NetworkJson | undefined): boolean {
  return network?.ecosystem === WalletEcosystem.Iroha;
}

function isIrohaTransferEnabled(): boolean {
  return process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true';
}

async function estimateIrohaTransferFee(
  params: IrohaTransferParams,
  frameSizer: IrohaTransferFrameSizer,
  client?: IrohaToriiWalletClient
): Promise<string> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');

  const prepared = prepareIrohaTransfer(params);
  const torii = client ?? createTransferClient(prepared);
  const quote = await quoteIrohaTransfer(torii, prepared, frameSizer, Date.now());

  return quote.fee;
}

async function makeIrohaTransfer(
  params: IrohaTransferParams,
  codec: IrohaTransferCodec | undefined,
  frameSizer: IrohaTransferFrameSizer,
  client?: IrohaToriiWalletClient
): Promise<void> {
  if (!isIrohaTransferEnabled()) throw new Error('iroha_transfer_disabled');

  const prepared = prepareIrohaTransfer(params);

  if (!codec) throw new Error('iroha_transfer_codec_unavailable');

  const torii = client ?? createTransferClient(prepared);
  const creationTimeMs = Date.now();
  const quote = await quoteIrohaTransfer(torii, prepared, frameSizer, creationTimeMs);

  await assertIrohaTransferFunded(torii, prepared, quote);

  const result = await codec.buildAndSignTransfer({
    ...transferPayloadInput(prepared, quote, creationTimeMs),
    derivationPath: prepared.source.derivationPath,
    mnemonicOrSeed: prepared.source.mnemonicOrSeed,
  });
  const hash = normalizeSignedTransactionHash(result.signedTransactionHashHex);

  if (!(result.signedTransaction instanceof Uint8Array) || result.signedTransaction.byteLength === 0) {
    throw new Error('invalid_iroha_signed_transaction');
  }

  await torii.submitTransactionAndWait(result.signedTransaction, hash, { timeoutMs: IROHA_TRANSFER_WAIT_MS });

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

  console.info(`Iroha transfer applied: ${hash}`);
}

function createTransferClient(prepared: PreparedIrohaTransfer): IrohaToriiWalletClient {
  return new IrohaToriiWalletClient({ baseUrl: prepared.toriiBaseUrl, network: prepared.network });
}

function transferPayloadInput(
  prepared: PreparedIrohaTransfer,
  quote: IrohaTransferQuote,
  creationTimeMs: number
): Omit<IrohaTransferCodecInput, 'derivationPath' | 'mnemonicOrSeed'> {
  return {
    amount: prepared.amount,
    authority: prepared.source.irohaAddress,
    creationTimeMs,
    destinationAccountId: prepared.destinationAccountId,
    feeAssetDefinitionId: quote.feeAssetDefinitionId,
    maxFee: quote.fee,
    networkId: quote.networkId,
    networkPrefix: quote.networkPrefix,
    signingPublicKeyHex: prepared.source.publicKeyHex,
    sourceAssetId: prepared.sourceAssetId,
    ttlMs: IROHA_TRANSFER_TTL_MS,
  };
}

// Confirms the node is the pinned network on the wire format the codec encodes, checks the
// amount against the asset's precision, and prices the exact transfer from the live fee schedule.
async function quoteIrohaTransfer(
  client: IrohaToriiWalletClient,
  prepared: PreparedIrohaTransfer,
  frameSizer: IrohaTransferFrameSizer,
  creationTimeMs: number
): Promise<IrohaTransferQuote> {
  const profile = UNIVERSAL_WALLET_IROHA_NETWORKS[prepared.network];
  const pinnedNetworkId = 'networkId' in profile ? profile.networkId : undefined;

  if (!pinnedNetworkId) throw new Error('iroha_network_identity_unavailable');

  const [networkId, capabilities, parameters, definition] = await Promise.all([
    client.getNetworkId(),
    client.getNodeCapabilities<unknown>(),
    client.getParameters<unknown>(),
    client.getAssetDefinition<unknown>(prepared.assetDefinitionId),
  ]);

  if (networkId !== pinnedNetworkId) throw new Error('iroha_network_reset');
  assertSupportedWire(capabilities.body);
  assertAmountPrecision(prepared, definition.body);

  const schedule = parseFeeSchedule(parameters.body);
  let quote: IrohaTransferQuote = {
    fee: computeIrohaTransferFee(schedule, 0),
    feeAssetDefinitionId: schedule.assetDefinitionId,
    networkId,
    networkPrefix: profile.chainDiscriminant,
  };

  // The fee cap is part of the signed bytes, so a per-byte fee needs a stable fixed point.
  for (let attempt = 0; attempt < MAX_FEE_REFINEMENTS; attempt += 1) {
    const frameBytes = frameSizer(transferPayloadInput(prepared, quote, creationTimeMs));
    const fee = computeIrohaTransferFee(schedule, frameBytes);

    if (fee === quote.fee) return quote;
    quote = { ...quote, fee };
  }

  throw new Error('iroha_fee_estimation_unavailable');
}

function computeIrohaTransferFee(schedule: IrohaFeeSchedule, frameBytes: number): string {
  return addIrohaQuantities(
    schedule.baseFee,
    multiplyIrohaQuantity(schedule.perByteFee, frameBytes),
    multiplyIrohaQuantity(schedule.perInstructionFee, IROHA_TRANSFER_INSTRUCTIONS),
    multiplyIrohaQuantity(schedule.perGasUnitFee, IROHA_TRANSFER_GAS_UNITS)
  );
}

function parseFeeSchedule(parameters: unknown): IrohaFeeSchedule {
  const custom = isRecord(parameters) && isRecord(parameters.custom) ? parameters.custom : undefined;
  const entry = custom && isRecord(custom.root_fees_v1) ? custom.root_fees_v1 : undefined;
  const fees = entry && isRecord(entry.payload) ? entry.payload : undefined;

  if (!fees || typeof fees.fee_asset_id !== 'string' || !fees.fee_asset_id) {
    throw new Error('iroha_fee_estimation_unavailable');
  }

  try {
    return {
      assetDefinitionId: normalizeIrohaAssetDefinitionId(fees.fee_asset_id),
      baseFee: canonicalizeIrohaQuantity(String(fees.base_fee)),
      perByteFee: canonicalizeIrohaQuantity(String(fees.per_byte_fee)),
      perGasUnitFee: canonicalizeIrohaQuantity(String(fees.per_gas_unit_fee)),
      perInstructionFee: canonicalizeIrohaQuantity(String(fees.per_instruction_fee)),
    };
  } catch {
    throw new Error('iroha_fee_estimation_unavailable');
  }
}

function assertSupportedWire(capabilities: unknown): void {
  if (
    !isRecord(capabilities) ||
    capabilities.data_model_version !== IROHA_TRANSACTION_WIRE.dataModelVersion ||
    capabilities.signed_transaction_schema_hash_hex !== IROHA_TRANSACTION_WIRE.signedTransactionSchemaHash
  ) {
    throw new Error('iroha_node_protocol_unsupported');
  }
}

function assertAmountPrecision(prepared: PreparedIrohaTransfer, definition: unknown): void {
  const spec = isRecord(definition) && isRecord(definition.spec) ? definition.spec : undefined;
  const scale = spec?.scale;

  if (
    !isRecord(definition) ||
    definition.id !== prepared.assetDefinitionId ||
    typeof scale !== 'number' ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 28
  ) {
    throw new Error('iroha_asset_definition_unavailable');
  }
  if (getIrohaQuantityScale(prepared.amount) > scale) throw new Error('invalid_iroha_amount_precision');
}

async function assertIrohaTransferFunded(
  client: IrohaToriiWalletClient,
  prepared: PreparedIrohaTransfer,
  quote: IrohaTransferQuote
): Promise<void> {
  const balances = new Map<string, string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_BALANCE_PAGES; page += 1) {
    const { body } = await client.getAccountAssets<Record<string, unknown>>(prepared.source.irohaAddress, { cursor });

    for (const item of body.items) {
      if (item.account_id !== prepared.source.irohaAddress || item.scope !== 'global') continue;
      if (typeof item.asset !== 'string' || typeof item.quantity !== 'string') continue;

      balances.set(item.asset, addIrohaQuantities(balances.get(item.asset) ?? '0', item.quantity));
    }
    if (!body.next_cursor) break;
    cursor = body.next_cursor;
  }

  const required = new Map<string, string>([[prepared.assetDefinitionId, prepared.amount]]);

  required.set(quote.feeAssetDefinitionId, addIrohaQuantities(required.get(quote.feeAssetDefinitionId) ?? '0', quote.fee));

  for (const [assetId, amount] of required) {
    if (compareIrohaQuantities(balances.get(assetId) ?? '0', amount) < 0) {
      throw new Error(assetId === prepared.assetDefinitionId ? 'iroha_insufficient_balance' : 'iroha_insufficient_fee_balance');
    }
  }
}

function prepareIrohaTransfer({ amount, assetId, from, networkKey, state, to }: IrohaTransferParams): PreparedIrohaTransfer {
  const networkJson = state.networkService.networkMap[networkKey];

  if (!isIrohaTransferNetwork(networkJson)) throw new Error('unsupported_iroha_network');

  const network = getIrohaNetworkKey(networkJson);
  const configuredToriiBaseUrl = getConfiguredIrohaToriiBaseUrl(networkJson, network);

  if (!configuredToriiBaseUrl) throw new Error('iroha_network_unavailable');

  const source = resolveIrohaTransferSource(state, from, network);
  const assetDefinitionId = normalizeIrohaAssetDefinitionId(assetId, network);

  return {
    amount: normalizeIrohaTransferAmount(amount),
    assetDefinitionId,
    destinationAccountId: normalizeIrohaRecipient(to, network),
    network,
    networkKey,
    source,
    sourceAssetId: `${assetDefinitionId}#${source.irohaAddress}`,
    toriiBaseUrl: normalizeIrohaToriiBaseUrl(configuredToriiBaseUrl),
  };
}

function resolveIrohaTransferSource(state: State, from: string, network: IrohaNetworkKey): IrohaTransferSource {
  const account = state.keyringService.getAllAccounts().find(({ address, meta }) => {
    const { irohaAddress } = meta as FWKeyringMeta;

    return address === from || irohaAddress === from;
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
  if (typeof network.chainId !== 'string' || !network.chainId || network.chainId !== network.chainId.trim()) {
    throw new Error('invalid_iroha_chain_id');
  }
  const discriminant = (network as { chainDiscriminant?: unknown; i105Prefix?: unknown }).chainDiscriminant ??
    (network as { i105Prefix?: unknown }).i105Prefix;
  if (
    discriminant !== undefined &&
    discriminant !== null &&
    discriminant !== UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant &&
    discriminant !== UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant
  ) {
    throw new Error('unsupported_iroha_network');
  }
  const matches = (key: IrohaNetworkKey): boolean => {
    const profile = UNIVERSAL_WALLET_IROHA_NETWORKS[key];

    if (network.chainId !== profile.chainId) return false;
    if (discriminant === undefined || discriminant === null) return true;
    if (discriminant !== profile.chainDiscriminant) throw new Error('ambiguous_iroha_network');

    return true;
  };

  if (matches('taira')) return 'taira';
  if (matches('nexus')) return 'nexus';
  if (
    discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainDiscriminant ||
    discriminant === UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainDiscriminant
  ) {
    throw new Error('noncanonical_iroha_chain_id');
  }

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

// Torii routes live at the origin root; older network records stored the MCP endpoint.
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

  url.pathname = url.pathname.replace(/\/+$/u, '').replace(/\/v1\/mcp$/u, '');

  return url.toString().replace(/\/+$/u, '');
}

function normalizeIrohaRecipient(address: string, network: IrohaNetworkKey): string {
  return parseIrohaI105Address(address, network).i105;
}

function normalizeIrohaTransferAmount(amount: string): string {
  if (typeof amount !== 'string' || amount !== amount.trim()) throw new Error('invalid_iroha_amount');
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,28})?$/u.test(amount)) throw new Error('invalid_iroha_amount');

  const canonical = canonicalizeIrohaQuantity(amount);

  if (canonical === '0') throw new Error('invalid_iroha_amount');

  return canonical;
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

function normalizeSignedTransactionHash(value: string | undefined): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{63}[13579bdf]$/u.test(value)) {
    throw new Error('invalid_iroha_transaction_hash');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export {
  IROHA_TRANSFER_GAS_UNITS,
  IROHA_TRANSFER_TTL_MS,
  computeIrohaTransferFee,
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  getIrohaToriiBaseUrl,
  isIrohaTransferEnabled,
  isIrohaTransferNetwork,
  makeIrohaTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaToriiBaseUrl,
  normalizeIrohaTransferAmount,
  prepareIrohaTransfer,
  quoteIrohaTransfer,
  resolveIrohaTransferSource,
  type IrohaFeeSchedule,
  type IrohaNetworkKey,
  type IrohaSignedTransaction,
  type IrohaTransferCodec,
  type IrohaTransferCodecInput,
  type IrohaTransferFrameSizer,
  type IrohaTransferParams,
  type IrohaTransferQuote,
  type IrohaTransferSource,
  type PreparedIrohaTransfer,
};
