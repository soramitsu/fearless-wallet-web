export interface AssetKeyParts {
  ecosystem: string;
  chainId: string;
  assetId: string;
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

/** One portfolio row's identity: `ecosystem:chainId:assetId`, EVM contract ids lowercased, every other id exact. */
export function createAssetKey({ ecosystem, chainId, assetId }: AssetKeyParts): string {
  return [normalizeKeyPart(ecosystem), normalizeKeyPart(chainId), normalizeCanonicalAssetId(ecosystem, assetId)].join(':');
}
