import canonicalAssetGroupsDocument from '@/portfolio/data/canonical-asset-groups.v1.json';
import testnetChainIdsDocument from '@/portfolio/data/testnet-chain-ids.v1.json';
import defaultVisibleAtZeroDocument from '@/portfolio/data/default-visible-at-zero.v1.json';

/**
 * The shared portfolio files of Android, iOS and the extension (root workspace `config/token-groups/` and
 * `config/portfolio/`, see `docs/portfolio-contract.md` there), bundled byte for byte in `src/portfolio/data/`.
 * `scripts/sync-canonical-asset-groups.mjs` in the root repository copies the files and rewrites these pins:
 * never edit a copy or a pin by hand. `tests/unit/shared-portfolio-config.spec.ts` hashes the bundled bytes.
 */
export const CANONICAL_ASSET_GROUPS_SHA256 = 'c8875a2e1b8e3a1a0fb4e90962004ce219033a9d5c5dbd49067b5a7ebcfa454e';
export const TESTNET_CHAIN_IDS_SHA256 = 'a3a5433f496e5575c770fdc253277be80fbcf3c97eaa7b37a6b199a2b6e44629';
export const DEFAULT_VISIBLE_AT_ZERO_SHA256 = 'a331788fbcd263ccaf4bcc7d3c83c7430d7c25ac7f9b4e2513606f67b68f20b6';

/** One listed zero default: the registry `chainId` and `assets[].id`, exactly as in `chains/v13`. */
export interface ZeroDefaultEntry {
  chainId: string;
  assetId: string;
}

/** One registry asset whose registry price is not trusted: the registry `chainId` and `assets[].id`. */
export interface UntrustedAssetEntry {
  chainId: string;
  assetId: string;
}

/**
 * Why an asset is a member of its group: `native` (the relay chain or L1 coin), `system-parachain`,
 * `xcm-reserve` (a reserve-backed copy on a parachain), `canonical-rollup`, `issuer-native` (deployed by the
 * issuer itself) or `app-owned-native`. The portfolio shows it next to the network, so a parachain copy is never
 * read as the relay-chain asset.
 */
export type CanonicalMemberRole = string;

/** One member of an approved group, exactly as the shared file lists it. */
export interface CanonicalGroupMemberEntry {
  chainId: string;
  assetId: string;
  symbol: string;
  precision: number;
  role: CanonicalMemberRole;
  network: string;
}

/** One approved group of the shared file (portfolio contract §1, §6). */
export interface CanonicalGroupEntry {
  id: string;
  symbol: string;
  name: string;
  members: CanonicalGroupMemberEntry[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isIdentifier = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim();

/**
 * The extra testnet chain ids. A document of another format or version gives an empty list, which leaves the
 * registry `testnet` option as the only signal; it never turns a testnet into a mainnet that was listed before.
 */
export function parseTestnetChainIds(document: unknown): Set<string> {
  if (!isRecord(document) || document.format !== 'fearless.testnet-chain-ids' || document.version !== 1) return new Set();
  if (!Array.isArray(document.chainIds)) return new Set();

  return new Set(
    document.chainIds.filter(isRecord).map(({ chainId }) => chainId).filter(isIdentifier)
  );
}

/**
 * The listed part of the one zero rule. `undefined` when the document is unusable, so the caller falls back to the
 * computed rule (primary utility asset of a ranked mainnet) instead of showing no zero rows at all.
 */
export function parseDefaultVisibleAtZero(document: unknown): ZeroDefaultEntry[] | undefined {
  if (!isRecord(document) || document.format !== 'fearless.default-visible-at-zero' || document.version !== 1) return undefined;
  if (!Array.isArray(document.entries)) return undefined;

  const entries = document.entries
    .filter(isRecord)
    .filter((entry) => isIdentifier(entry.chainId) && isIdentifier(entry.assetId))
    .map(({ chainId, assetId }) => ({ chainId: chainId as string, assetId: assetId as string }));

  return entries.length ? entries : undefined;
}

/**
 * The `untrustedAssets` of the groups file (portfolio contract §3): registry assets that get no price whatever
 * `priceId` the registry gives them. A document of another format or version, or one without the list, gives an
 * empty list, which leaves the registry price in force as it was before the list existed.
 */
export function parseUntrustedAssets(document: unknown): UntrustedAssetEntry[] {
  if (!isRecord(document) || document.format !== 'fearless.canonical-asset-groups' || document.version !== 1) return [];
  if (!Array.isArray(document.untrustedAssets)) return [];

  return document.untrustedAssets
    .filter(isRecord)
    .filter((entry) => isIdentifier(entry.chainId) && isIdentifier(entry.assetId))
    .map(({ chainId, assetId }) => ({ chainId: chainId as string, assetId: assetId as string }));
}

const GROUP_ID = /^[a-z0-9][a-z0-9-]{0,31}$/u;

function parseGroupMember(value: unknown): CanonicalGroupMemberEntry | undefined {
  if (!isRecord(value)) return undefined;

  const { chainId, assetId, symbol, precision, role, network } = value;
  if (![chainId, assetId, symbol, role].every(isIdentifier)) return undefined;
  if (!Number.isInteger(precision) || (precision as number) < 0) return undefined;

  return {
    chainId: chainId as string,
    assetId: assetId as string,
    symbol: symbol as string,
    precision: precision as number,
    role: role as string,
    network: typeof network === 'string' ? network : '',
  };
}

/**
 * The approved groups of the shared file. Proposed groups never render (portfolio contract §6). A document of
 * another format or version gives no groups, so every asset stays its own row and nothing can merge wrongly; a group
 * with a malformed member is left out whole rather than rendered without it.
 */
export function parseApprovedGroups(document: unknown): CanonicalGroupEntry[] {
  if (!isRecord(document) || document.format !== 'fearless.canonical-asset-groups' || document.version !== 1) return [];
  if (!Array.isArray(document.groups)) return [];

  return document.groups.flatMap((group) => {
    if (!isRecord(group) || group.status !== 'approved' || !Array.isArray(group.members)) return [];
    if (typeof group.id !== 'string' || !GROUP_ID.test(group.id) || !isIdentifier(group.symbol)) return [];

    const members = group.members.map(parseGroupMember);
    if (members.length === 0 || members.some((member) => !member)) return [];

    return [
      {
        id: group.id,
        symbol: group.symbol as string,
        name: isIdentifier(group.name) ? (group.name as string) : (group.symbol as string),
        members: members as CanonicalGroupMemberEntry[],
      },
    ];
  });
}

export const TESTNET_CHAIN_IDS: ReadonlySet<string> = parseTestnetChainIds(testnetChainIdsDocument);

export const DEFAULT_VISIBLE_AT_ZERO: readonly ZeroDefaultEntry[] | undefined =
  parseDefaultVisibleAtZero(defaultVisibleAtZeroDocument);

export const UNTRUSTED_ASSETS: readonly UntrustedAssetEntry[] = parseUntrustedAssets(canonicalAssetGroupsDocument);

export const APPROVED_GROUPS: readonly CanonicalGroupEntry[] = parseApprovedGroups(canonicalAssetGroupsDocument);
