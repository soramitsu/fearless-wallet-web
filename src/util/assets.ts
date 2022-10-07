import type { AssetJson, TypeAsset } from '@/interfaces';
import NetworksController from '@/controllers/networksController';

const ORML_PALLETS_TYPES = ['ormlChain', 'equilibrium'];

function getOptions(symbol: string, type: TypeAsset, assetId: string) {
  const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
  const { currencyId } = assetsJson.find(({ id }) => id === assetId)!;

  if (type === 'stable') return { Stable: symbol.toUpperCase() };
  if (type === 'vToken') return { VToken: symbol.toUpperCase() };
  if (type === 'vsToken') return { VSToken: symbol.toUpperCase() };
  if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };

  return { Token: symbol.toUpperCase() };
}

export { ORML_PALLETS_TYPES, getOptions };
