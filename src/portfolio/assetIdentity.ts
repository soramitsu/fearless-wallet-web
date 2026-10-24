import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import type { BalanceItem, NetworkScanState } from '@extension-base/api/evm/types';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';

export type AssetPreference = 'auto' | 'shown' | 'hidden';
export type AssetMetadataTrust = 'verified' | 'unverified' | 'missing';
export type AssetMetadataSource = 'registry' | 'chain' | 'indexer';
export type PriceTrust = 'canonicalAsset' | 'curatedGroup' | 'unavailable';
export type NetworkScanCoverage = 'complete' | 'catalogOnly' | 'limited';

export interface AssetKeyParts {
  ecosystem: string;
  chainId: string;
  assetId: string;
}

export interface PortfolioAsset {
  key: string;
  keyParts: AssetKeyParts;
  groupId: string;
  networkName: string;
  networkIcon: string;
  assetId: string;
  name: string;
  symbol: string;
  icon: string;
  balanceText: string;
  fiatValue: string | null;
  unitPrice: string | null;
  priceChangePercent: string | null;
  priceTrust: PriceTrust;
  trust: AssetMetadataTrust;
  source: AssetMetadataSource;
  preference: AssetPreference;
  isNative: boolean;
  isReady: boolean;
  /** The last balance request failed (`isReady` is then false too). */
  balanceFailed?: boolean;
  timestamp?: number;
}

export interface PortfolioNetworkSection {
  key: string;
  name: string;
  icon: string;
  ecosystem: string;
  chainId: string;
  address: string;
  subtotal: string;
  hasPricedAssets: boolean;
  latestTimestamp?: number;
  lastAttempt?: number;
  stale: boolean;
  error?: string;
  coverage: NetworkScanCoverage;
  assets: PortfolioAsset[];
  detectedAssets: PortfolioAsset[];
}

export interface AssetPreferenceSnapshotItem {
  key: string;
  groupId: string;
  balanceText: string;
}

const normalizeKeyPart = (value: unknown, lowercase = true): string => {
  const text = String(value ?? '').trim();
  return encodeURIComponent(lowercase ? text.toLowerCase() : text);
};

function normalizeCanonicalAssetId(ecosystem: string, assetId: string): string {
  const normalizedEcosystem = ecosystem.trim().toLowerCase();
  const isEvm = normalizedEcosystem === 'evm' || normalizedEcosystem.includes('ethereum');
  return normalizeKeyPart(assetId, isEvm);
}

export function createAssetKey({ ecosystem, chainId, assetId }: AssetKeyParts): string {
  return [normalizeKeyPart(ecosystem), normalizeKeyPart(chainId), normalizeCanonicalAssetId(ecosystem, assetId)].join(':');
}

export function getCanonicalAssetId(balance: BalanceItem): string {
  return (
    balance.solanaTokenMint ??
    balance.currencyId ??
    balance.id
  );
}

function findRegistryAsset(network: NetworkJson, balance: BalanceItem): NetworkJson['assets'][number] | undefined {
  const ecosystem = String(network.ecosystem ?? balance.relayChain ?? '').toLowerCase();
  const normalizeId = (value: unknown): string => {
    const id = String(value ?? '').trim();
    return ecosystem === 'evm' || ecosystem === 'ethereum' || ecosystem.includes('ethereum') ? id.toLowerCase() : id;
  };
  const ids = [balance.solanaTokenMint, balance.currencyId, balance.id]
    .filter((item): item is string => Boolean(item))
    .map(normalizeId);

  return network.assets.find((asset) => {
    const candidates = [asset.id, asset.currencyId]
      .filter((item): item is string => Boolean(item))
      .map(normalizeId);

    return candidates.some((candidate) => ids.includes(candidate));
  });
}

function metadataSource(ecosystem: string, verified: boolean): AssetMetadataSource {
  if (verified) return 'registry';
  if (ecosystem === 'ton') return 'chain';
  return 'indexer';
}

function scanCoverage(ecosystem: string, network: NetworkJson, balance: BalanceItem): NetworkScanCoverage {
  if (balance.scanCoverage) return balance.scanCoverage;
  if (ecosystem === 'ton') return 'complete';
  if (ecosystem === 'solana') return /test|dev/i.test(`${network.name} ${network.chainId}`) ? 'limited' : 'complete';
  if (ecosystem === 'bitcoin') {
    const discovery = balance as BalanceItem & { bitcoinAddresses?: unknown[] };
    return discovery.bitcoinAddresses?.length ? 'complete' : 'limited';
  }
  if (ecosystem === 'iroha') return 'complete';
  return 'catalogOnly';
}

const coverageRank: Record<NetworkScanCoverage, number> = { complete: 2, catalogOnly: 1, limited: 0 };

// The asset discovery sweep's rule: these networks are not swept, so a zero there is a placeholder, not a reading.
function isTestNetwork(network: NetworkJson): boolean {
  return (
    Boolean(network.options?.some((option) => String(option).toLowerCase() === 'testnet')) ||
    /(?:^|\s)(?:testnet|test|dev)(?:\s|$)/iu.test(`${network.name} ${network.chainId}`)
  );
}

const searchText = ({ symbol, name }: Pick<PortfolioAsset, 'symbol' | 'name'>): string => `${symbol} ${name}`.toLowerCase();

// From the start of a word, so "dot" finds DOT but not every token on Polkadot Asset Hub.
const namesNetwork = ({ name }: NetworkJson, query: string): boolean => ` ${name.toLowerCase()}`.includes(` ${query}`);

/** Best first: the exact symbol, a symbol prefix, a word of the name, any part of either, then its network only. */
function searchRank(asset: Pick<PortfolioAsset, 'symbol' | 'name'>, query: string): number {
  const symbol = asset.symbol.toLowerCase();

  if (symbol === query) return 0;
  if (symbol.startsWith(query)) return 1;
  if (asset.name.toLowerCase().split(/\s+/u).some((word) => word.startsWith(query))) return 2;
  if (searchText(asset).includes(query)) return 3;
  return 4;
}

const isHeld = ({ balanceText }: PortfolioAsset): boolean => new FPNumber(balanceText).isGreaterThan(FPNumber.ZERO);

const wasRead = ({ isReady, balanceFailed }: PortfolioAsset): boolean => isReady || Boolean(balanceFailed);

/**
 * The background can keep its never-read placeholder beside the row a scan loaded under another name spelling
 * ("solana" and "Solana"): the loaded row answers. Rows that were both read stay, as they may be different assets.
 */
function withoutPlaceholderTwins(assets: PortfolioAsset[]): PortfolioAsset[] {
  const readKeys = new Set(assets.filter(wasRead).map(({ key }) => key));
  const placeholderKeys = new Set<string>();

  return assets.filter((asset) => {
    if (wasRead(asset)) return true;
    if (readKeys.has(asset.key) || placeholderKeys.has(asset.key)) return false;
    placeholderKeys.add(asset.key);
    return true;
  });
}

function compareByValue(left: PortfolioAsset, right: PortfolioAsset): number {
  if (left.fiatValue !== null || right.fiatValue !== null) {
    const leftValue = new FPNumber(left.fiatValue ?? '-1');
    const rightValue = new FPNumber(right.fiatValue ?? '-1');
    if (!leftValue.eq(rightValue)) return rightValue.gt(leftValue) ? 1 : -1;
  }
  return left.symbol.localeCompare(right.symbol) || left.key.localeCompare(right.key);
}

function compareSectionsByValue(left: PortfolioNetworkSection, right: PortfolioNetworkSection): number {
  if (left.hasPricedAssets !== right.hasPricedAssets) return left.hasPricedAssets ? -1 : 1;
  if (left.hasPricedAssets && right.hasPricedAssets && left.subtotal !== right.subtotal) {
    return new FPNumber(right.subtotal).gt(new FPNumber(left.subtotal)) ? 1 : -1;
  }
  return left.name.localeCompare(right.name);
}

function decimalBalance(balance: BalanceItem): string {
  const value = String(balance.transferable ?? balance.total ?? balance.free ?? '0').trim();

  try {
    const amount = new FPNumber(value);
    return amount.isFinity() && amount.isGteZero() ? amount.toString() : '0';
  } catch {
    return '0';
  }
}

function assetDisplayName(
  group: TokenGroup,
  balance: BalanceItem,
  registryAsset?: NetworkJson['assets'][number]
): string {
  const registryName = registryAsset?.name?.trim();
  if (registryName) return registryName;
  const value = group.tokenName?.trim();
  if (value) return value;
  return balance.symbol || group.symbol || '';
}

/**
 * A deterministic registry + balance snapshot used by preference migration.
 * It intentionally ignores display filters and visibility preferences.
 */
export function buildAssetPreferenceSnapshot(
  groups: TokenGroup[],
  networks: NetworkJson[]
): AssetPreferenceSnapshotItem[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const snapshot = new Map<string, AssetPreferenceSnapshotItem>();

  groups.forEach((group) => {
    group.balances.forEach((balance) => {
      const network = networkByName.get(balance.name.toLowerCase());
      if (!network) return;
      const ecosystem = String(network.ecosystem ?? balance.relayChain ?? group.relayChain ?? 'unknown').toLowerCase();
      const key = createAssetKey({ ecosystem, chainId: String(network.chainId || network.name), assetId: getCanonicalAssetId(balance) });

      snapshot.set(key, { key, groupId: group.groupId, balanceText: decimalBalance(balance) });
    });
  });

  networks.forEach((network) => {
    const ecosystem = String(network.ecosystem ?? 'unknown').toLowerCase();
    network.assets.forEach((asset) => {
      const assetId = String(asset.currencyId ?? asset.id);
      const key = createAssetKey({ ecosystem, chainId: String(network.chainId || network.name), assetId });
      if (snapshot.has(key)) return;

      const owner = groups.find((group) =>
        group.balances.some(
          (balance) =>
            balance.name.toLowerCase() === network.name.toLowerCase() &&
            [balance.solanaTokenMint, balance.currencyId, balance.id].some((id) => id === assetId)
        )
      );

      snapshot.set(key, { key, groupId: owner?.groupId ?? asset.id, balanceText: '0' });
    });
  });

  return [...snapshot.values()].sort((left, right) => left.key.localeCompare(right.key));
}

export function buildPortfolioSections({
  groups,
  networks,
  prices,
  priceChanges = {},
  preferences,
  addressForNetwork,
  scanStates = {},
  surfaceDiscoveredAssets = true,
  search = '',
  isSelectedNetwork = () => false,
}: {
  groups: TokenGroup[];
  networks: NetworkJson[];
  prices: Record<string, number>;
  priceChanges?: Record<string, number>;
  preferences: Record<string, AssetPreference>;
  addressForNetwork: (network: NetworkJson) => string;
  scanStates?: Record<string, NetworkScanState>;
  surfaceDiscoveredAssets?: boolean;
  /**
   * Lists only matching assets, but every verified one the wallet can hold, at zero or hidden too: a token the
   * wallet supports must never look unsupported because it holds none.
   */
  search?: string;
  /** The network the list is filtered to: its test-network zero rows also answer a search. */
  isSelectedNetwork?: (network: NetworkJson) => boolean;
}): PortfolioNetworkSection[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const sections = new Map<string, PortfolioNetworkSection>();
  const query = search.trim().toLowerCase();
  // "devnet" names a test network, "sol" names Solana first: a test network shares in a search only by its own name.
  const namesNoMainnet = !networks.some((network) => !isTestNetwork(network) && namesNetwork(network, query));

  groups.forEach((group) => {
    group.balances.forEach((balance) => {
      const network = networkByName.get(balance.name.toLowerCase());
      if (!network) return;

      const ecosystem = String(network.ecosystem ?? balance.relayChain ?? group.relayChain ?? 'unknown').toLowerCase();
      const chainId = String(network.chainId || network.name);
      const assetId = getCanonicalAssetId(balance);
      const keyParts = { ecosystem, chainId, assetId };
      const key = createAssetKey(keyParts);
      const registryAsset = findRegistryAsset(network, balance);
      const verified = balance.assetMetadataTrust === 'verified' || Boolean(registryAsset);
      const trust: AssetMetadataTrust = balance.assetMetadataTrust ?? (verified ? 'verified' : assetId ? 'unverified' : 'missing');
      const preference = preferences[key] ?? 'auto';
      const balanceText = decimalBalance(balance);
      const amount = new FPNumber(balanceText);
      // A price contributes to fiat totals only when it is bound to this exact
      // canonical asset. Legacy group/symbol price ids are intentionally ignored.
      const hasRegistryPriceBinding = Boolean(registryAsset?.priceId);
      const hasExplicitAssetKeyPriceBinding =
        balance.assetMetadataTrust === 'verified' &&
        Boolean(balance.priceId) &&
        balance.priceAssetKey === key;
      const priceTrust: PriceTrust = hasRegistryPriceBinding || hasExplicitAssetKeyPriceBinding
        ? 'canonicalAsset'
        : 'unavailable';
      const priceId = hasRegistryPriceBinding ? registryAsset?.priceId : hasExplicitAssetKeyPriceBinding ? balance.priceId : undefined;
      const trustedPrice = priceTrust !== 'unavailable' && priceId ? prices[priceId] : undefined;
      const unitPrice = Number.isFinite(trustedPrice) && Number(trustedPrice) > 0 ? String(trustedPrice) : null;
      const fiatValue = unitPrice === null ? null : amount.mul(new FPNumber(unitPrice)).toString();
      const priceChange = priceTrust !== 'unavailable' && priceId ? priceChanges[priceId] : undefined;
      const priceChangePercent = Number.isFinite(priceChange) ? String(priceChange) : null;
      const asset: PortfolioAsset = {
        key,
        keyParts,
        groupId: group.groupId,
        networkName: network.name,
        networkIcon: network.icon,
        assetId,
        name: assetDisplayName(group, balance, registryAsset),
        symbol: (registryAsset?.symbol || balance.symbol || group.symbol || '').toUpperCase(),
        icon: registryAsset?.icon || group.icon,
        balanceText,
        fiatValue,
        unitPrice,
        priceChangePercent,
        priceTrust,
        trust,
        source: balance.assetMetadataSource ?? metadataSource(ecosystem, verified),
        preference,
        isNative: Boolean(balance.isNative || balance.isUtility),
        isReady: balance.state === APIItemState.READY,
        balanceFailed: balance.state === APIItemState.ERROR,
        timestamp: balance.timestamp,
      };
      const sectionKey = `${ecosystem}:${chainId}`;
      const explicitScan = scanStates[network.name];
      const section = sections.get(sectionKey) ?? {
        key: sectionKey,
        name: network.name,
        icon: network.icon,
        ecosystem,
        chainId,
        address: addressForNetwork(network),
        subtotal: '0',
        hasPricedAssets: false,
        latestTimestamp: explicitScan?.lastSuccess,
        lastAttempt: explicitScan?.lastAttempt,
        stale: explicitScan?.stale ?? false,
        error: explicitScan?.error,
        coverage: explicitScan?.coverage ?? scanCoverage(ecosystem, network, balance),
        assets: [],
        detectedAssets: [],
      };

      const hasBalance = amount.isGreaterThan(FPNumber.ZERO);
      if (hasBalance && fiatValue !== null) {
        section.subtotal = new FPNumber(section.subtotal).add(new FPNumber(fiatValue)).toString();
        section.hasPricedAssets = true;
      }
      if (!explicitScan && balance.timestamp && (!section.latestTimestamp || balance.timestamp > section.latestTimestamp)) {
        section.latestTimestamp = balance.timestamp;
      }
      const assetCoverage = scanCoverage(ecosystem, network, balance);
      if (!explicitScan && coverageRank[assetCoverage] < coverageRank[section.coverage]) section.coverage = assetCoverage;

      const keepsDefaultNative =
        Number.isFinite(network.rank) || Boolean(section.address && network.favorite?.includes(section.address));
      const shouldShowZero = asset.isNative && keepsDefaultNative;
      const networkMatches = Boolean(query) && namesNetwork(network, query);
      const answersSearch = !query || networkMatches || searchText(asset).includes(query);

      if (query && trust === 'verified') {
        // A zero needs an address to receive on; test networks are not swept, so their zeros wait until named.
        const listsZero =
          Boolean(section.address) &&
          (!isTestNetwork(network) || isSelectedNetwork(network) || (networkMatches && namesNoMainnet));
        if (answersSearch && (hasBalance || listsZero)) section.assets.push(asset);
      } else if (answersSearch) {
        if (preference !== 'hidden' && trust === 'verified' && (hasBalance || shouldShowZero)) section.assets.push(asset);
        if (preference === 'shown' && trust !== 'verified' && hasBalance) section.assets.push(asset);
        if (surfaceDiscoveredAssets && preference === 'auto' && trust !== 'verified' && hasBalance) {
          section.detectedAssets.push(asset);
        }
      }

      sections.set(sectionKey, section);
    });
  });

  // Search results: holdings first, by value; then the closest matches, on popular networks first.
  const compareSearchAssets = (left: PortfolioAsset, right: PortfolioAsset): number => {
    if (isHeld(left) !== isHeld(right)) return isHeld(left) ? -1 : 1;
    if (isHeld(left)) return compareByValue(left, right);
    return (
      searchRank(left, query) - searchRank(right, query) ||
      Number(right.isNative) - Number(left.isNative) ||
      left.symbol.localeCompare(right.symbol) ||
      left.key.localeCompare(right.key)
    );
  };
  const holds = (section: PortfolioNetworkSection): boolean =>
    section.assets.some(isHeld) || section.detectedAssets.some(isHeld);
  const bestRank = (section: PortfolioNetworkSection): number =>
    Math.min(...section.assets.map((asset) => searchRank(asset, query)));
  const networkRank = (section: PortfolioNetworkSection): number => {
    const rank = networkByName.get(section.name.toLowerCase())?.rank;
    return Number.isFinite(rank) ? Number(rank) : Number.POSITIVE_INFINITY;
  };
  const compareSearchSections = (left: PortfolioNetworkSection, right: PortfolioNetworkSection): number => {
    if (holds(left) !== holds(right)) return holds(left) ? -1 : 1;
    if (holds(left)) return compareSectionsByValue(left, right);
    return (
      bestRank(left) - bestRank(right) ||
      // Two unranked networks give NaN, which falls through to the name.
      networkRank(left) - networkRank(right) ||
      left.name.localeCompare(right.name)
    );
  };

  return [...sections.values()]
    .filter((section) => section.assets.length > 0 || section.detectedAssets.length > 0)
    .map((section) => {
      const sorted = {
        ...section,
        assets: withoutPlaceholderTwins(section.assets).sort(query ? compareSearchAssets : compareByValue),
        detectedAssets: [...section.detectedAssets].sort((left, right) => left.symbol.localeCompare(right.symbol)),
      };
      if (!query) return sorted;

      // A search header totals the rows it lists, not the rest of the network.
      const priced = [...sorted.assets, ...sorted.detectedAssets].filter(
        (asset) => isHeld(asset) && asset.fiatValue !== null
      );
      return {
        ...sorted,
        subtotal: priced.reduce((sum, asset) => sum.add(new FPNumber(asset.fiatValue ?? '0')), FPNumber.ZERO).toString(),
        hasPricedAssets: priced.length > 0,
      };
    })
    .sort(query ? compareSearchSections : compareSectionsByValue);
}

export function buildPortfolioSummary(
  input: Omit<Parameters<typeof buildPortfolioSections>[0], 'preferences'>
): { total: string; changeAmount: string; changePercent: string } {
  const assets = buildPortfolioSections({ ...input, preferences: {} }).flatMap((section) => section.assets);
  let total = FPNumber.ZERO;
  let priorTotal = FPNumber.ZERO;

  assets.forEach((asset) => {
    if (asset.priceTrust === 'unavailable' || asset.fiatValue === null) return;
    const current = new FPNumber(asset.fiatValue);
    total = total.add(current);
    const change = new FPNumber(asset.priceChangePercent ?? '0').div(FPNumber.HUNDRED);
    const denominator = FPNumber.ONE.add(change);
    priorTotal = priorTotal.add(denominator.isGreaterThan(FPNumber.ZERO) ? current.div(denominator) : current);
  });

  const changeAmount = total.sub(priorTotal);
  const changePercent = priorTotal.isZero()
    ? FPNumber.ZERO
    : changeAmount.div(priorTotal).mul(FPNumber.HUNDRED);

  return {
    total: total.toString(),
    changeAmount: changeAmount.toString(),
    changePercent: changePercent.toString(),
  };
}
