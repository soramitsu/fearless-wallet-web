import { APIItemState } from '@extension-base/api/types/networks';
import { FPNumber } from '@sora-substrate/util';
import type { BalanceItem, NetworkScanState } from '@extension-base/api/evm/types';
import type { NetworkJson } from '@extension-base/types';
import type { AccountJson, TokenGroup } from '@extension-base/background/types/types';
import type { AssetPreferenceSource } from '@/portfolio/legacyPreferences305';
import { createAssetKey, type AssetKeyParts } from '@/portfolio/assetKey';
import { createZeroDefaultRule, isTestnetNetwork } from '@/portfolio/zeroRule';
import { WalletEcosystem } from '@/interfaces';

export { createAssetKey, type AssetKeyParts };

export type AssetPreference = 'auto' | 'shown' | 'hidden';
export type AssetMetadataTrust = 'verified' | 'unverified' | 'missing';
export type AssetMetadataSource = 'registry' | 'chain' | 'indexer';
export type PriceTrust = 'canonicalAsset' | 'curatedGroup' | 'unavailable';
export type NetworkScanCoverage = 'complete' | 'catalogOnly' | 'limited';
export type PortfolioMode = 'view' | 'manage';

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
  /** The total balance (free + reserved): what the wallet holds, including staked and locked funds. */
  balanceText: string;
  /** The part of the balance that can be sent now; shown as a secondary line when it differs. */
  transferableText: string;
  hasBalance: boolean;
  fiatValue: string | null;
  hasPrice: boolean;
  unitPrice: string | null;
  priceChangePercent: string | null;
  priceTrust: PriceTrust;
  trust: AssetMetadataTrust;
  source: AssetMetadataSource;
  preference: AssetPreference;
  preferenceSource: AssetPreferenceSource;
  hidden: boolean;
  isNative: boolean;
  isUtility: boolean;
  isTestnet: boolean;
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
  /** Fiat of the displayed, non-hidden, non-testnet rows, so subtotals add up to the header total. */
  subtotal: string;
  hasPricedAssets: boolean;
  isTestnet: boolean;
  latestTimestamp?: number;
  lastAttempt?: number;
  stale: boolean;
  error?: string;
  coverage: NetworkScanCoverage;
  assets: PortfolioAsset[];
  detectedAssets: PortfolioAsset[];
}

export interface PortfolioSectionsInput {
  groups: TokenGroup[];
  networks: NetworkJson[];
  prices: Record<string, number>;
  priceChanges?: Record<string, number>;
  preferences: Record<string, AssetPreference>;
  addressForNetwork: (network: NetworkJson) => string;
  scanStates?: Record<string, NetworkScanState>;
  surfaceDiscoveredAssets?: boolean;
  /** `view` applies the visibility rules; `manage` lists every verified asset, zero and hidden ones included. */
  mode?: PortfolioMode;
  /** View filter: drop zero-balance rows. Never written to preferences, so a later deposit shows up. */
  hideZero?: boolean;
  /** View filter: keep hidden rows, flagged `hidden`, instead of dropping them. */
  showHidden?: boolean;
  /** Show testnet networks; their value is never counted either way. */
  showTestnets?: boolean;
  /** The one zero rule for Auto rows. Defaults to the shared list plus the wallet's favourite networks. */
  isDefaultVisibleAtZero?: (network: NetworkJson, asset: PortfolioAsset) => boolean;
  /** Networks the wallet holds an account for. A funded verified asset is shown even outside this scope. */
  walletScope?: (network: NetworkJson) => boolean;
  /** A strict network filter (the Popular, Favourites or single-network selection). */
  networkFilter?: (network: NetworkJson) => boolean;
  isTestnet?: (network: NetworkJson) => boolean;
  preferenceSource?: (key: string) => AssetPreferenceSource;
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

function decimalAmount(value: unknown): string {
  try {
    const amount = new FPNumber(String(value ?? '0').trim());
    return amount.isFinity() && amount.isGteZero() ? amount.toString() : '0';
  } catch {
    return '0';
  }
}

/**
 * What the wallet holds on this row: the total balance (free + reserved on Substrate, where staked and locked funds
 * live inside free or reserved). Every other ecosystem reports `total === transferable`.
 */
function holdingBalance(balance: BalanceItem): string {
  return decimalAmount(balance.total ?? balance.free ?? balance.transferable ?? '0');
}

function transferableBalance(balance: BalanceItem): string {
  return decimalAmount(balance.transferable ?? balance.total ?? balance.free ?? '0');
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

const ecosystemOf = (network: NetworkJson): string => String(network.ecosystem ?? 'unknown').toLowerCase();
const isEvmEcosystem = (ecosystem: string): boolean => ecosystem === 'evm' || ecosystem.includes('ethereum');

/** Whether a row adds its fiat to subtotals and to the header total. */
const countsTowardsTotal = (asset: PortfolioAsset): boolean =>
  !asset.hidden && !asset.isTestnet && asset.trust === 'verified' && asset.hasBalance && asset.fiatValue !== null;

function withSubtotal(section: PortfolioNetworkSection): PortfolioNetworkSection {
  const counted = section.assets.filter(countsTowardsTotal);

  return {
    ...section,
    subtotal: counted.reduce((sum, asset) => sum.add(new FPNumber(asset.fiatValue!)), FPNumber.ZERO).toString(),
    hasPricedAssets: counted.length > 0,
  };
}

const compareAssets = (left: PortfolioAsset, right: PortfolioAsset): number => {
  if (left.hasBalance !== right.hasBalance) return left.hasBalance ? -1 : 1;
  if (left.fiatValue !== null || right.fiatValue !== null) {
    const leftValue = new FPNumber(left.fiatValue ?? '-1');
    const rightValue = new FPNumber(right.fiatValue ?? '-1');
    if (!leftValue.eq(rightValue)) return rightValue.gt(leftValue) ? 1 : -1;
  }
  return left.symbol.localeCompare(right.symbol) || left.key.localeCompare(right.key);
};

export function buildPortfolioSections({
  groups,
  networks,
  prices,
  priceChanges = {},
  preferences,
  addressForNetwork,
  scanStates = {},
  surfaceDiscoveredAssets = true,
  mode = 'view',
  hideZero = false,
  showHidden = false,
  showTestnets = false,
  isDefaultVisibleAtZero,
  walletScope = () => true,
  networkFilter = () => true,
  isTestnet = (network) => isTestnetNetwork(network),
  preferenceSource = (key) => (preferences[key] && preferences[key] !== 'auto' ? 'explicit' : 'auto'),
}: PortfolioSectionsInput): PortfolioNetworkSection[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const sections = new Map<string, PortfolioNetworkSection>();
  let zeroRule: ((network: NetworkJson, asset: PortfolioAsset) => boolean) | undefined = isDefaultVisibleAtZero;
  const showsAtZero = (network: NetworkJson, asset: PortfolioAsset): boolean => {
    if (!zeroRule) {
      const rule = createZeroDefaultRule({
        networks,
        isTestnet,
        isFavourite: (candidate) => Boolean(candidate.favorite?.includes(addressForNetwork(candidate))),
      });
      zeroRule = (candidate, candidateAsset) => rule(candidate, candidateAsset.key);
    }

    return zeroRule(network, asset);
  };

  groups.forEach((group) => {
    group.balances.forEach((balance) => {
      const network = networkByName.get(balance.name.toLowerCase());
      if (!network || !networkFilter(network)) return;

      const testnet = isTestnet(network);
      if (testnet && !showTestnets) return;

      const ecosystem = String(network.ecosystem ?? balance.relayChain ?? group.relayChain ?? 'unknown').toLowerCase();
      const chainId = String(network.chainId || network.name);
      const assetId = getCanonicalAssetId(balance);
      const keyParts = { ecosystem, chainId, assetId };
      const key = createAssetKey(keyParts);
      const registryAsset = findRegistryAsset(network, balance);
      const verified = balance.assetMetadataTrust === 'verified' || Boolean(registryAsset);
      const trust: AssetMetadataTrust = balance.assetMetadataTrust ?? (verified ? 'verified' : assetId ? 'unverified' : 'missing');
      const balanceText = holdingBalance(balance);
      const amount = new FPNumber(balanceText);
      const hasBalance = amount.isGreaterThan(FPNumber.ZERO);
      // Never hide money behind a scope heuristic: a funded verified asset stays visible and counted.
      if (!walletScope(network) && !(hasBalance && trust === 'verified')) return;

      const preference = preferences[key] ?? 'auto';
      const hidden = preference === 'hidden';
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
        transferableText: transferableBalance(balance),
        hasBalance,
        fiatValue,
        hasPrice: unitPrice !== null,
        unitPrice,
        priceChangePercent,
        priceTrust,
        trust,
        source: balance.assetMetadataSource ?? metadataSource(ecosystem, verified),
        preference,
        preferenceSource: preferenceSource(key),
        hidden,
        isNative: Boolean(balance.isNative),
        isUtility: Boolean(balance.isUtility),
        isTestnet: testnet,
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
        isTestnet: testnet,
        latestTimestamp: explicitScan?.lastSuccess,
        lastAttempt: explicitScan?.lastAttempt,
        stale: explicitScan?.stale ?? false,
        error: explicitScan?.error,
        coverage: explicitScan?.coverage ?? scanCoverage(ecosystem, network, balance),
        assets: [],
        detectedAssets: [],
      };

      if (!explicitScan && balance.timestamp && (!section.latestTimestamp || balance.timestamp > section.latestTimestamp)) {
        section.latestTimestamp = balance.timestamp;
      }
      const assetCoverage = scanCoverage(ecosystem, network, balance);
      if (!explicitScan && coverageRank[assetCoverage] < coverageRank[section.coverage]) section.coverage = assetCoverage;

      if (mode === 'manage') {
        // Every verified asset, every holding, and every asset with an explicit choice, so any hide can be undone.
        if (trust === 'verified' || hasBalance || preference !== 'auto') section.assets.push(asset);
      } else if (hidden) {
        if (showHidden && (trust === 'verified' || hasBalance)) section.assets.push(asset);
      } else if (trust === 'verified') {
        const showsZero = preference === 'shown' || showsAtZero(network, asset);
        if (hasBalance || (!hideZero && showsZero)) section.assets.push(asset);
      } else if (hasBalance) {
        if (preference === 'shown') section.assets.push(asset);
        else if (surfaceDiscoveredAssets) section.detectedAssets.push(asset);
      }

      sections.set(sectionKey, section);
    });
  });

  return [...sections.values()]
    .filter((section) => section.assets.length > 0 || section.detectedAssets.length > 0)
    .map((section) =>
      withSubtotal({
        ...section,
        assets: [...section.assets].sort(compareAssets),
        detectedAssets: [...section.detectedAssets].sort((left, right) => left.symbol.localeCompare(right.symbol)),
      })
    )
    .sort((left, right) => {
      if (left.hasPricedAssets !== right.hasPricedAssets) return left.hasPricedAssets ? -1 : 1;
      if (left.hasPricedAssets && right.hasPricedAssets && left.subtotal !== right.subtotal) {
        return new FPNumber(right.subtotal).gt(new FPNumber(left.subtotal)) ? 1 : -1;
      }
      return left.name.localeCompare(right.name);
    });
}

/** Keeps the rows a predicate accepts, recomputes subtotals, and drops sections left without rows. */
export function filterSectionAssets(
  sections: PortfolioNetworkSection[],
  keep: (asset: PortfolioAsset, section: PortfolioNetworkSection) => boolean
): PortfolioNetworkSection[] {
  return sections
    .map((section) =>
      withSubtotal({
        ...section,
        assets: section.assets.filter((asset) => keep(asset, section)),
        detectedAssets: section.detectedAssets.filter((asset) => keep(asset, section)),
      })
    )
    .filter((section) => section.assets.length > 0 || section.detectedAssets.length > 0);
}

/**
 * Search over the built sections: a network-name match keeps the whole network, otherwise only rows whose symbol or
 * name match remain, and a network with no matching row is dropped (no empty headers).
 */
export function filterSectionsBySearch(sections: PortfolioNetworkSection[], query: string | undefined): PortfolioNetworkSection[] {
  const search = query?.trim().toLowerCase() ?? '';
  if (!search) return sections;

  return filterSectionAssets(
    sections,
    (asset, section) =>
      section.name.toLowerCase().includes(search) || `${asset.symbol} ${asset.name}`.toLowerCase().includes(search)
  );
}

const sectionHasBalance = (section: PortfolioNetworkSection): boolean =>
  [...section.assets, ...section.detectedAssets].some(({ hasBalance }) => hasBalance);

/** Funded networks first; networks that only hold zero rows go into the collapsed "N networks · no balance" block. */
export function splitZeroSections(sections: PortfolioNetworkSection[]): {
  funded: PortfolioNetworkSection[];
  zeroOnly: PortfolioNetworkSection[];
} {
  return {
    funded: sections.filter(sectionHasBalance),
    zeroOnly: sections.filter((section) => !sectionHasBalance(section)),
  };
}

type ScopedAccount = Pick<AccountJson, 'chains' | 'universalWallet'>;
type ScopedWallet = {
  ethereumAddress?: string;
  bitcoinAddress?: string;
  solanaAddress?: string;
  irohaAddress?: string;
  walletEcosystem?: WalletEcosystem;
  isMobile?: boolean;
};

/** The account ecosystems a wallet holds (`substrate`, `evm`, `ton`, `bitcoin`, `solana`, `iroha`). */
export function walletAccountEcosystems(account: ScopedAccount | undefined, wallet: ScopedWallet): Set<string> {
  const ecosystems = new Set<string>();
  const publicAccounts = account?.universalWallet?.publicAccounts ?? [];

  publicAccounts.forEach(({ ecosystem, address }) => {
    if (typeof address === 'string' && address.trim()) ecosystems.add(String(ecosystem));
  });
  if (!publicAccounts.length) {
    if (wallet.walletEcosystem && wallet.walletEcosystem !== WalletEcosystem.Substrate) ecosystems.add(wallet.walletEcosystem);
    else ecosystems.add(WalletEcosystem.Substrate);
  }
  if (wallet.ethereumAddress?.trim()) ecosystems.add(WalletEcosystem.Evm);
  if (wallet.bitcoinAddress?.trim()) ecosystems.add(WalletEcosystem.Bitcoin);
  if (wallet.solanaAddress?.trim()) ecosystems.add(WalletEcosystem.Solana);
  if (wallet.irohaAddress?.trim()) ecosystems.add(WalletEcosystem.Iroha);

  return ecosystems;
}

/**
 * The networks a wallet holds an account for: EVM networks need its EVM account, every other network an account of
 * the network's ecosystem, and a mobile-imported wallet only covers the chains it was imported with (the 3.0.5 rule).
 */
export function scopeNetworksToWallet(
  account: ScopedAccount | undefined,
  wallet: ScopedWallet
): (network: NetworkJson) => boolean {
  const ecosystems = walletAccountEcosystems(account, wallet);
  const mobileChains = wallet.isMobile && account?.chains?.length ? account.chains : undefined;

  return (network) => {
    if (mobileChains && !mobileChains.some((chain) => String(network.chainId).includes(chain))) return false;

    const ecosystem = ecosystemOf(network);
    return ecosystems.has(isEvmEcosystem(ecosystem) ? WalletEcosystem.Evm : ecosystem);
  };
}

export interface PortfolioSummary {
  /** Fiat of every visible, priced, non-testnet holding: the header total. */
  total: string;
  changeAmount: string;
  changePercent: string;
  /** Funded verified assets the user hid; they are excluded from `total`. */
  hiddenCount: number;
  hiddenValue: string;
  hiddenFundedKeys: string[];
  /** Every hidden asset Manage lists for this wallet, funded or not (the "Hidden (N)" filter). */
  hiddenAssetCount: number;
  /** Visible funded assets without a trusted price. */
  unpricedCount: number;
  /** A counted native holding sits on a network with nomination pools, whose stakes are outside free + reserved. */
  poolStakesExcluded: boolean;
}

export type PortfolioSummaryInput = Omit<
  PortfolioSectionsInput,
  'preferences' | 'mode' | 'hideZero' | 'showHidden' | 'showTestnets' | 'surfaceDiscoveredAssets' | 'isDefaultVisibleAtZero'
> & { preferences?: Record<string, AssetPreference> };

/**
 * The wallet-wide value: every verified holding with a balance, independent of the zero rule, Hide zero and the
 * display filters. Hidden assets go to `hiddenValue`, unpriced ones to `unpricedCount`, and testnets are never counted.
 */
export function buildPortfolioSummary(input: PortfolioSummaryInput): PortfolioSummary {
  const networksByChainId = new Map(input.networks.map((network) => [String(network.chainId || network.name), network]));
  const sections = buildPortfolioSections({
    ...input,
    preferences: input.preferences ?? {},
    mode: 'manage',
    showTestnets: false,
    surfaceDiscoveredAssets: false,
  });
  let total = FPNumber.ZERO;
  let priorTotal = FPNumber.ZERO;
  let hiddenValue = FPNumber.ZERO;
  const hiddenFundedKeys: string[] = [];
  let unpricedCount = 0;
  let hiddenAssetCount = 0;
  let poolStakesExcluded = false;

  sections.forEach((section) => {
    section.assets.forEach((asset) => {
      if (asset.hidden) hiddenAssetCount += 1;
      if (asset.trust !== 'verified' || !asset.hasBalance || asset.isTestnet) return;

      if (asset.hidden) {
        hiddenFundedKeys.push(asset.key);
        if (asset.fiatValue !== null) hiddenValue = hiddenValue.add(new FPNumber(asset.fiatValue));
        return;
      }
      if (asset.isNative || asset.isUtility) {
        poolStakesExcluded ||= Boolean(networksByChainId.get(section.chainId)?.options?.includes('poolStaking'));
      }
      if (asset.priceTrust === 'unavailable' || asset.fiatValue === null) {
        unpricedCount += 1;
        return;
      }

      const current = new FPNumber(asset.fiatValue);
      total = total.add(current);
      const change = new FPNumber(asset.priceChangePercent ?? '0').div(FPNumber.HUNDRED);
      const denominator = FPNumber.ONE.add(change);
      priorTotal = priorTotal.add(denominator.isGreaterThan(FPNumber.ZERO) ? current.div(denominator) : current);
    });
  });

  const changeAmount = total.sub(priorTotal);
  const changePercent = priorTotal.isZero()
    ? FPNumber.ZERO
    : changeAmount.div(priorTotal).mul(FPNumber.HUNDRED);

  return {
    total: total.toString(),
    changeAmount: changeAmount.toString(),
    changePercent: changePercent.toString(),
    hiddenCount: hiddenFundedKeys.length,
    hiddenValue: hiddenValue.toString(),
    hiddenFundedKeys: hiddenFundedKeys.sort(),
    hiddenAssetCount,
    unpricedCount,
    poolStakesExcluded,
  };
}
