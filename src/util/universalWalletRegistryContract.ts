import { WalletEcosystem } from '@/interfaces';

const UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION = 1;
const UNIVERSAL_WALLET_REGISTRY_ENDPOINT_KINDS = ['indexer', 'rpc', 'torii-mcp', 'explorer'] as const;
const UNIVERSAL_WALLET_REGISTRY_FEATURES = ['transfer', 'offline-cash', 'sccp', 'governance'] as const;

type UniversalWalletRegistryEndpointKind = (typeof UNIVERSAL_WALLET_REGISTRY_ENDPOINT_KINDS)[number];
type UniversalWalletRegistryFeature = (typeof UNIVERSAL_WALLET_REGISTRY_FEATURES)[number];

type UniversalWalletRegistryValidationError =
  | 'invalidSchemaVersion'
  | 'chainsRequired'
  | 'duplicateChainId'
  | 'invalidId'
  | 'invalidEcosystem'
  | 'invalidChainId'
  | 'invalidDisplayName'
  | 'endpointRequired'
  | 'invalidDerivationPath'
  | 'invalidSlip44CoinType'
  | 'invalidAssetId'
  | 'invalidAssetSymbol'
  | 'invalidAssetDecimals'
  | 'invalidAssetName'
  | 'duplicateEndpointId'
  | 'invalidEndpointId'
  | 'invalidEndpointKind'
  | 'invalidEndpointUrl'
  | 'invalidEndpointPriority'
  | 'duplicateFeatureId'
  | 'invalidFeatureId'
  | 'publicWriteIndexer';

type UniversalWalletRegistryAsset = {
  id: string;
  symbol: string;
  decimals: number;
  name?: string;
};

type UniversalWalletRegistryEndpoint = {
  id: string;
  kind: UniversalWalletRegistryEndpointKind | string;
  url: string;
  readOnly: boolean;
  priority?: number;
};

type UniversalWalletChainRegistryEntry = {
  id: string;
  ecosystem: WalletEcosystem | string;
  chainId: string;
  displayName: string;
  enabledByDefault: boolean;
  nativeAsset?: UniversalWalletRegistryAsset;
  derivationPath?: string;
  slip44CoinType?: number;
  features?: UniversalWalletRegistryFeature[] | string[];
  endpoints: UniversalWalletRegistryEndpoint[];
};

type UniversalWalletChainRegistry = {
  schemaVersion: number;
  chains: UniversalWalletChainRegistryEntry[];
};

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{1,63}$/;
const CHAIN_ID_PATTERN = /^[A-Za-z0-9._:-]{2,128}$/;
const ASSET_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SYMBOL_PATTERN = /^[A-Z0-9]{2,16}$/;
const DERIVATION_PATH_PATTERN = /^m(?:\/[0-9]+'?)*$/;
const LOCAL_ENDPOINT_HOSTS = new Set(['localhost', '127.0.0.1']);

function validateUniversalWalletChainRegistry(
  registry: UniversalWalletChainRegistry
): UniversalWalletRegistryValidationError[] {
  const errors = new Set<UniversalWalletRegistryValidationError>();

  if (registry.schemaVersion !== UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION) errors.add('invalidSchemaVersion');
  if (!registry.chains.length) errors.add('chainsRequired');

  const ids = new Set<string>();
  const chainIds = new Set<string>();
  for (const chain of registry.chains) {
    validateUniversalWalletChainRegistryEntry(chain).forEach((error) => errors.add(error));
    if (ids.has(chain.id)) errors.add('duplicateChainId');
    ids.add(chain.id);
    if (chainIds.has(chain.chainId)) errors.add('duplicateChainId');
    chainIds.add(chain.chainId);
  }

  return [...errors];
}

function validateUniversalWalletChainRegistryEntry(
  chain: UniversalWalletChainRegistryEntry
): UniversalWalletRegistryValidationError[] {
  const errors = new Set<UniversalWalletRegistryValidationError>();

  if (!ID_PATTERN.test(chain.id)) errors.add('invalidId');
  if (!isKnownEcosystem(chain.ecosystem)) errors.add('invalidEcosystem');
  if (!CHAIN_ID_PATTERN.test(chain.chainId)) errors.add('invalidChainId');
  if (!isHumanText(chain.displayName, 80)) errors.add('invalidDisplayName');
  if (chain.enabledByDefault && !chain.endpoints.length) errors.add('endpointRequired');
  if (chain.nativeAsset) validateUniversalWalletRegistryAsset(chain.nativeAsset).forEach((error) => errors.add(error));
  if (chain.derivationPath?.trim() && !DERIVATION_PATH_PATTERN.test(chain.derivationPath)) {
    errors.add('invalidDerivationPath');
  }
  if (chain.slip44CoinType !== undefined && (!Number.isInteger(chain.slip44CoinType) || chain.slip44CoinType < 0)) {
    errors.add('invalidSlip44CoinType');
  }

  const featureIds = new Set<string>();
  for (const feature of chain.features ?? []) {
    if (!isKnownFeature(feature)) errors.add('invalidFeatureId');
    if (featureIds.has(feature)) errors.add('duplicateFeatureId');
    featureIds.add(feature);
  }

  const endpointIds = new Set<string>();
  for (const endpoint of chain.endpoints) {
    validateUniversalWalletRegistryEndpoint(endpoint).forEach((error) => errors.add(error));
    if (endpointIds.has(endpoint.id)) errors.add('duplicateEndpointId');
    endpointIds.add(endpoint.id);
  }

  return [...errors];
}

function validateUniversalWalletRegistryAsset(asset: UniversalWalletRegistryAsset): UniversalWalletRegistryValidationError[] {
  const errors = new Set<UniversalWalletRegistryValidationError>();

  if (!ASSET_ID_PATTERN.test(asset.id)) errors.add('invalidAssetId');
  if (!SYMBOL_PATTERN.test(asset.symbol)) errors.add('invalidAssetSymbol');
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 255) errors.add('invalidAssetDecimals');
  if (asset.name !== undefined && !isHumanText(asset.name, 80)) errors.add('invalidAssetName');

  return [...errors];
}

function validateUniversalWalletRegistryEndpoint(
  endpoint: UniversalWalletRegistryEndpoint
): UniversalWalletRegistryValidationError[] {
  const errors = new Set<UniversalWalletRegistryValidationError>();
  const priority = endpoint.priority ?? 0;

  if (!ID_PATTERN.test(endpoint.id)) errors.add('invalidEndpointId');
  if (!isKnownEndpointKind(endpoint.kind)) errors.add('invalidEndpointKind');
  if (!isAllowedEndpointUrl(endpoint.url)) errors.add('invalidEndpointUrl');
  if (!Number.isInteger(priority) || priority < 0) errors.add('invalidEndpointPriority');
  if (!endpoint.readOnly && endpoint.kind === 'indexer') errors.add('publicWriteIndexer');

  return [...errors];
}

function isAllowedEndpointUrl(value: string): boolean {
  if (/\s/u.test(value)) return false;

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.username || url.password || url.search || url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;

  return LOCAL_ENDPOINT_HOSTS.has(url.hostname);
}

function isKnownEcosystem(value: string): value is WalletEcosystem {
  return (Object.values(WalletEcosystem) as string[]).includes(value);
}

function isKnownEndpointKind(value: string): value is UniversalWalletRegistryEndpointKind {
  return (UNIVERSAL_WALLET_REGISTRY_ENDPOINT_KINDS as readonly string[]).includes(value);
}

function isKnownFeature(value: string): value is UniversalWalletRegistryFeature {
  return (UNIVERSAL_WALLET_REGISTRY_FEATURES as readonly string[]).includes(value);
}

function isHumanText(value: string, maxLength: number): boolean {
  const normalized = value.trim();
  return !!normalized && normalized.length <= maxLength && !hasControlCharacters(normalized);
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export {
  UNIVERSAL_WALLET_REGISTRY_ENDPOINT_KINDS,
  UNIVERSAL_WALLET_REGISTRY_FEATURES,
  UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION,
  validateUniversalWalletChainRegistry,
  validateUniversalWalletChainRegistryEntry,
  validateUniversalWalletRegistryAsset,
  validateUniversalWalletRegistryEndpoint,
};

export type {
  UniversalWalletChainRegistry,
  UniversalWalletChainRegistryEntry,
  UniversalWalletRegistryAsset,
  UniversalWalletRegistryEndpoint,
  UniversalWalletRegistryEndpointKind,
  UniversalWalletRegistryFeature,
  UniversalWalletRegistryValidationError,
};
