/** The three parts of a portfolio asset key, `ecosystem:chainId:assetId` (src/portfolio/assetKey.ts), decoded. */
export interface HoldingKeyParts {
  ecosystem: string;
  chainId: string;
  assetId: string;
}

/**
 * Reads a holding's key back into the network and asset it names. The parts are percent-encoded, so a colon inside an
 * asset id cannot be mistaken for a separator. A key that does not have three parts, or does not decode, names nothing.
 */
export function parseHoldingKey(key: string): HoldingKeyParts | undefined {
  const parts = key.split(':');

  if (parts.length !== 3 || parts.some((part) => part === '')) return undefined;

  try {
    const [ecosystem, chainId, assetId] = parts.map((part) => decodeURIComponent(part));

    return { ecosystem, chainId, assetId };
  } catch {
    return undefined;
  }
}

/** EVM contract ids differ only by case; every other id is compared exactly. */
export function sameAssetId(ecosystem: string, left: string, right: string): boolean {
  const evm = ecosystem === 'evm' || ecosystem.includes('ethereum');

  return evm ? left.toLowerCase() === right.toLowerCase() : left === right;
}
