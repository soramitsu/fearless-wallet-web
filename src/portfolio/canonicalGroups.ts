import testnetChainIdsDocument from '@/portfolio/data/testnet-chain-ids.v1.json';
import defaultVisibleAtZeroDocument from '@/portfolio/data/default-visible-at-zero.v1.json';

/**
 * The shared portfolio files of Android, iOS and the extension (root workspace `config/token-groups/` and
 * `config/portfolio/`, see `docs/portfolio-contract.md` there), bundled byte for byte in `src/portfolio/data/`.
 * `scripts/sync-canonical-asset-groups.mjs` in the root repository copies the files and rewrites these pins:
 * never edit a copy or a pin by hand. `tests/unit/shared-portfolio-config.spec.ts` hashes the bundled bytes.
 */
export const CANONICAL_ASSET_GROUPS_SHA256 = '3d82b68cc6b8162154aaf95b4393cc47b49200c04c3d25baf6da3580a66f1908';
export const TESTNET_CHAIN_IDS_SHA256 = 'a3a5433f496e5575c770fdc253277be80fbcf3c97eaa7b37a6b199a2b6e44629';
export const DEFAULT_VISIBLE_AT_ZERO_SHA256 = 'a331788fbcd263ccaf4bcc7d3c83c7430d7c25ac7f9b4e2513606f67b68f20b6';

/** One listed zero default: the registry `chainId` and `assets[].id`, exactly as in `chains/v13`. */
export interface ZeroDefaultEntry {
  chainId: string;
  assetId: string;
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

export const TESTNET_CHAIN_IDS: ReadonlySet<string> = parseTestnetChainIds(testnetChainIdsDocument);

export const DEFAULT_VISIBLE_AT_ZERO: readonly ZeroDefaultEntry[] | undefined =
  parseDefaultVisibleAtZero(defaultVisibleAtZeroDocument);
