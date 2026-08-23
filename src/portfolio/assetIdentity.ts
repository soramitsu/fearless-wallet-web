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
  return balance.symbol || group.symbol || 'Unknown asset';
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
}: {
  groups: TokenGroup[];
  networks: NetworkJson[];
  prices: Record<string, number>;
  priceChanges?: Record<string, number>;
  preferences: Record<string, AssetPreference>;
  addressForNetwork: (network: NetworkJson) => string;
  scanStates?: Record<string, NetworkScanState>;
  surfaceDiscoveredAssets?: boolean;
}): PortfolioNetworkSection[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const sections = new Map<string, PortfolioNetworkSection>();

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
      if (preference !== 'hidden' && trust === 'verified' && (hasBalance || shouldShowZero)) section.assets.push(asset);
      if (preference === 'shown' && trust !== 'verified' && hasBalance) section.assets.push(asset);
      if (surfaceDiscoveredAssets && preference === 'auto' && trust !== 'verified' && hasBalance) {
        section.detectedAssets.push(asset);
      }

      sections.set(sectionKey, section);
    });
  });

  return [...sections.values()]
    .filter((section) => section.assets.length > 0 || section.detectedAssets.length > 0)
    .map((section) => ({
      ...section,
      assets: [...section.assets].sort((left, right) => {
        if (left.fiatValue !== null || right.fiatValue !== null) {
          const leftValue = new FPNumber(left.fiatValue ?? '-1');
          const rightValue = new FPNumber(right.fiatValue ?? '-1');
          if (!leftValue.eq(rightValue)) return rightValue.gt(leftValue) ? 1 : -1;
        }
        return left.symbol.localeCompare(right.symbol) || left.key.localeCompare(right.key);
      }),
      detectedAssets: [...section.detectedAssets].sort((left, right) => left.symbol.localeCompare(right.symbol)),
    }))
    .sort((left, right) => {
      if (left.hasPricedAssets !== right.hasPricedAssets) return left.hasPricedAssets ? -1 : 1;
      if (left.hasPricedAssets && right.hasPricedAssets && left.subtotal !== right.subtotal) {
        return new FPNumber(right.subtotal).gt(new FPNumber(left.subtotal)) ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });
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
