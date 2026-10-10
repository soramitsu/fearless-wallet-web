import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey, getCanonicalAssetId, type AssetPreference } from '@/portfolio/assetIdentity';

/**
 * Read-only reconstruction of the Chrome Web Store 3.0.5 asset preferences.
 *
 * 3.0.5 grouped assets across networks (DOT on Polkadot and every Polkadot parachain, USDT on every
 * Ethereum-option network, ...) and stored hides and the custom order per group, under one member's id:
 * `account_hidden-assets` = `{ [walletAddress]: groupId[] }`, `account_sequence-assets` =
 * `{ [walletAddress]: "g1,g2,…" }` and `account_custom-sort` = `{ [walletAddress]: true }`.
 * The functions below rebuild those groups from today's registry so a legacy hide covers every member
 * again. Nothing here writes storage: the legacy keys stay byte-identical, so a downgrade still reads them.
 */

/** Network ecosystems that existed in 3.0.5. Bitcoin, Solana and Iroha networks never joined a legacy group. */
export const LEGACY_305_ECOSYSTEMS = ['substrate', 'ethereum', 'ethereumbased', 'ton'];

export type AssetPreferenceSource = 'explicit' | 'legacy305' | 'auto';

export interface EffectiveAssetPreference {
  preference: AssetPreference;
  source: AssetPreferenceSource;
}

export interface Legacy305Group {
  /** The 3.0.5 ids of every member. The group id 3.0.5 stored is always one of them. */
  legacyIds: string[];
  /** The asset keys `buildPortfolioSections` gives the members today. */
  keys: string[];
}

export interface Legacy305JettonGroup extends Legacy305Group {
  /** The lowercased jetton symbol 3.0.5 merged on. */
  symbol: string;
}

const ecosystemOf = (network: NetworkJson): string => String(network.ecosystem ?? 'unknown').toLowerCase();

const isTonClass = (network: NetworkJson): boolean => ecosystemOf(network) === 'ton';

/** The networks 3.0.5 production builds loaded: enabled, without the `testnet` option, from a 3.0.5 ecosystem. */
function isLegacy305Network(network: NetworkJson): boolean {
  if (network.disabled) return false;
  if (network.options?.some((option) => String(option).toLowerCase() === 'testnet')) return false;

  return LEGACY_305_ECOSYSTEMS.includes(ecosystemOf(network));
}

/**
 * The `relayChain` 3.0.5 grouped on (`helpers/assets.ts:26-29` at 600a64d5): `'ethereum'` for networks with
 * the `ethereum` option, otherwise the parent network's name, otherwise the network's own name. The parent
 * is looked up among networks of the same TON / non-TON class, because 3.0.5 grouped one wallet type at a time.
 */
export function relay305(network: NetworkJson, networks: NetworkJson[]): string {
  if (network.options?.some((option) => option === 'ethereum')) return 'ethereum';

  const parent =
    network.parentId === undefined
      ? undefined
      : networks.find(
          (candidate) => isTonClass(candidate) === isTonClass(network) && candidate.chainId === network.parentId
        );

  return parent?.name ?? network.name;
}

function registryAssetKey(network: NetworkJson, asset: NetworkJson['assets'][number]): string {
  return createAssetKey({
    ecosystem: ecosystemOf(network),
    chainId: String(network.chainId || network.name),
    assetId: String(asset.currencyId ?? asset.id),
  });
}

/**
 * The 3.0.5 groups of today's registry. 3.0.5 put an asset into the first group whose current id equals
 * the asset id, or that has the same symbol and relay chain. A union-find over those two relations does not
 * depend on network order and reproduces the 3.0.5 partition of the production registry exactly
 * (legacy-preferences-305.spec.ts checks it against the 3.0.5 code). Comparisons stay exact and case-sensitive.
 */
export function buildLegacy305Groups(networks: NetworkJson[]): Legacy305Group[] {
  const legacyNetworks = networks.filter(isLegacy305Network);

  return [true, false].flatMap((tonClass) =>
    groupRegistryAssets(legacyNetworks.filter((network) => isTonClass(network) === tonClass))
  );
}

function groupRegistryAssets(networks: NetworkJson[]): Legacy305Group[] {
  const members: Array<{ key: string; legacyId: string }> = [];
  const parents: number[] = [];
  const firstMemberByLink = new Map<string, number>();

  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];

    for (let member = index; parents[member] !== root; ) {
      const next = parents[member];
      parents[member] = root;
      member = next;
    }

    return root;
  };

  networks.forEach((network) => {
    const relay = relay305(network, networks);

    network.assets.forEach((asset) => {
      const index = members.push({ key: registryAssetKey(network, asset), legacyId: asset.id }) - 1;
      parents.push(index);

      [`id\u0000${asset.id}`, `sr\u0000${asset.symbol}\u0000${relay}`].forEach((link) => {
        const linked = firstMemberByLink.get(link);
        if (linked === undefined) firstMemberByLink.set(link, index);
        else parents[find(index)] = find(linked);
      });
    });
  });

  const groups = new Map<number, { legacyIds: Set<string>; keys: Set<string> }>();
  members.forEach(({ key, legacyId }, index) => {
    const root = find(index);
    const group = groups.get(root) ?? { legacyIds: new Set<string>(), keys: new Set<string>() };
    group.legacyIds.add(legacyId);
    group.keys.add(key);
    groups.set(root, group);
  });

  return [...groups.values()].map(({ legacyIds, keys }) => ({ legacyIds: [...legacyIds], keys: [...keys] }));
}

/**
 * The 3.0.5 groups of the wallet's TON jettons. 3.0.5 gave a jetton the id `"${name} - ${symbol}"` in
 * lowercase (`helpers/index.ts:104-106` at 600a64d5) and merged jettons with the same lowercased symbol on
 * one network into the first one's group. Today a jetton is keyed by its master address, so the members are
 * read from the loaded balances and carry the same keys as `buildPortfolioSections`.
 */
export function buildLegacy305JettonGroups(groups: TokenGroup[], networks: NetworkJson[]): Legacy305JettonGroup[] {
  const networkByName = new Map(networks.map((network) => [network.name.toLowerCase(), network]));
  const jettonGroups = new Map<string, { symbol: string; legacyIds: Set<string>; keys: Set<string> }>();

  groups.forEach((group) => {
    group.balances.forEach((balance) => {
      if (balance.type !== 'jetton') return;

      const network = networkByName.get(String(balance.name ?? '').toLowerCase());
      if (!network || !isTonClass(network)) return;

      const symbol = String(balance.symbol ?? '').toLowerCase();
      const groupKey = `${network.name.toLowerCase()}\u0000${symbol}`;
      const jettonGroup = jettonGroups.get(groupKey) ?? {
        symbol,
        legacyIds: new Set<string>(),
        keys: new Set<string>(),
      };

      jettonGroup.legacyIds.add(`${String(group.tokenName ?? '').toLowerCase()} - ${symbol}`);
      jettonGroup.keys.add(
        createAssetKey({
          ecosystem: ecosystemOf(network),
          chainId: String(network.chainId || network.name),
          assetId: getCanonicalAssetId(balance),
        })
      );
      jettonGroups.set(groupKey, jettonGroup);
    });
  });

  return [...jettonGroups.values()].map(({ symbol, legacyIds, keys }) => ({
    symbol,
    legacyIds: [...legacyIds],
    keys: [...keys],
  }));
}

/**
 * Whether a stored 3.0.5 id names this jetton group. The stored id belonged to whichever same-symbol jetton
 * arrived first, which may no longer be in the wallet, so any stored jetton id with the group's symbol counts.
 */
function namesJettonGroup(group: Legacy305JettonGroup, legacyId: string): boolean {
  return group.legacyIds.includes(legacyId) || (group.symbol !== '' && legacyId.endsWith(` - ${group.symbol}`));
}

const registryIndexes = new WeakMap<Legacy305Group[], Map<string, Legacy305Group[]>>();

function registryGroupsByLegacyId(registryGroups: Legacy305Group[]): Map<string, Legacy305Group[]> {
  const cached = registryIndexes.get(registryGroups);
  if (cached) return cached;

  const index = new Map<string, Legacy305Group[]>();
  registryGroups.forEach((group) =>
    group.legacyIds.forEach((legacyId) => index.set(legacyId, [...(index.get(legacyId) ?? []), group]))
  );
  registryIndexes.set(registryGroups, index);

  return index;
}

function namedGroups(
  legacyId: string,
  registryGroups: Legacy305Group[],
  jettonGroups: Legacy305JettonGroup[]
): Legacy305Group[] {
  return [
    ...(registryGroupsByLegacyId(registryGroups).get(legacyId) ?? []),
    ...jettonGroups.filter((group) => namesJettonGroup(group, legacyId)),
  ];
}

/**
 * The asset keys a 3.0.5 hide list covers today. A registry group is hidden when any member's id was stored,
 * not only its final group id, so the result does not depend on the order the registry lists networks in.
 */
export function resolveLegacy305Hidden({
  legacyHiddenIds,
  registryGroups,
  jettonGroups = [],
}: {
  legacyHiddenIds: string[];
  registryGroups: Legacy305Group[];
  jettonGroups?: Legacy305JettonGroup[];
}): Set<string> {
  const hidden = new Set<string>();

  new Set(legacyHiddenIds).forEach((legacyId) =>
    namedGroups(legacyId, registryGroups, jettonGroups).forEach((group) => group.keys.forEach((key) => hidden.add(key)))
  );

  return hidden;
}

/** The stored 3.0.5 ids that name no group in today's registry or loaded jettons. */
export function unmappedLegacy305Ids({
  legacyIds,
  registryGroups,
  jettonGroups = [],
}: {
  legacyIds: string[];
  registryGroups: Legacy305Group[];
  jettonGroups?: Legacy305JettonGroup[];
}): string[] {
  return [...new Set(legacyIds)].filter(
    (legacyId) => legacyId !== '' && namedGroups(legacyId, registryGroups, jettonGroups).length === 0
  );
}

/**
 * The 3.0.5 custom order as `asset key → index`: every member takes the first position of its group in the
 * stored sequence. 3.0.5 applied a sequence only while `custom-sort` named the wallet; `setCustomSort`
 * replaced the whole map, so only the last wallet that saved an order kept it.
 */
export function resolveLegacy305Order({
  sequence,
  customSort,
  registryGroups,
  jettonGroups = [],
}: {
  sequence: string[];
  customSort: boolean;
  registryGroups: Legacy305Group[];
  jettonGroups?: Legacy305JettonGroup[];
}): Map<string, number> {
  const order = new Map<string, number>();
  if (customSort !== true) return order;

  sequence.forEach((legacyId, index) =>
    namedGroups(legacyId, registryGroups, jettonGroups).forEach((group) =>
      group.keys.forEach((key) => {
        if (!order.has(key)) order.set(key, index);
      })
    )
  );

  return order;
}

const isAssetPreference = (value: unknown): value is AssetPreference =>
  value === 'auto' || value === 'shown' || value === 'hidden';

/**
 * Explicit preferences win over derived legacy hides, including an explicit `'auto'`: that is how a user
 * un-hides a legacy-derived hide without touching the legacy key. Keys in neither input are `'auto'`.
 */
export function mergeAssetPreferences(
  explicit: Record<string, AssetPreference>,
  derivedHidden: Set<string>
): Record<string, EffectiveAssetPreference> {
  const merged: Record<string, EffectiveAssetPreference> = {};

  derivedHidden.forEach((key) => (merged[key] = { preference: 'hidden', source: 'legacy305' }));
  Object.entries(explicit).forEach(([key, preference]) => {
    if (isAssetPreference(preference)) merged[key] = { preference, source: 'explicit' };
  });

  return merged;
}
