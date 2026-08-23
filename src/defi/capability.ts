export type DeFiFeatureId = 'staking' | 'liquidityPools' | 'farming' | 'polkamarkt';

/**
 * Stable, display-ready capability result. DeFi entries stay visible while
 * actions use `available` and `reason` to fail closed.
 */
export interface DeFiCapability {
  feature: DeFiFeatureId;
  available: boolean;
  requiresAccount: boolean;
  requiresLocalSigning: boolean;
  supportedNetworks: string[];
  supportedAssetKeys: string[];
  reason?: string;
}

export const unavailableDeFiCapability = (
  feature: DeFiFeatureId,
  reason: string,
  requirements: Partial<Omit<DeFiCapability, 'feature' | 'available' | 'reason'>> = {}
): DeFiCapability => ({
  feature,
  available: false,
  requiresAccount: requirements.requiresAccount ?? true,
  requiresLocalSigning: requirements.requiresLocalSigning ?? true,
  supportedNetworks: requirements.supportedNetworks ?? [],
  supportedAssetKeys: requirements.supportedAssetKeys ?? [],
  reason,
});
