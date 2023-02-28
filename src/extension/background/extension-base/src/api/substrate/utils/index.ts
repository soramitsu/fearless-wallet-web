import { assetFromToken } from '@equilab/api';
import { state } from '../../../background/handlers';
import { AssetJson, TypeAsset } from '@/interfaces';

export function getAssetOptions(symbol: string, type: TypeAsset, assetId: string) {
  const assetsJson: AssetJson[] = state.tokenMap;
  const { currencyId } = assetsJson.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: symbol.toUpperCase() };
  if (type === 'vToken') return { VToken: symbol.toUpperCase() };
  if (type === 'vsToken') return { VSToken: symbol.toUpperCase() };
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };
  if (type === 'soraAsset') return currencyId;
  if (type === 'equilibrium') return assetFromToken(symbol)[0];

  return { Token: symbol.toUpperCase() };
}
