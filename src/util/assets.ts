import type { AssetJson } from '@/interfaces/assets';
import type { TypeAsset } from '@/interfaces/currencies';
import NetworksController from '@/controllers/networksController';

const ORML_PALLETS_TYPES = ['ormlChain', 'equilibrium'];

function getOptions(symbol: string, type: TypeAsset, assetId: string) {
  const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
  const { currencyId } = assetsJson.find(({ id }) => id === assetId)!; // eslint-disable-line

  if (type === 'stable') return { Stable: symbol.toUpperCase() };
  else if (type === 'vToken') return { VToken: symbol.toUpperCase() };
  else if (type === 'vsToken') return { VSToken: symbol.toUpperCase() };
  else if (type === 'foreignAsset') return { ForeignAsset: currencyId };
  else if (type === 'liquidCrowdloan') return { LiquidCrowdloan: currencyId };
  else if (type === 'stableAssetPoolToken') return { StableAssetPoolToken: currencyId };

  return { Token: symbol.toUpperCase() };
}

export { ORML_PALLETS_TYPES, getOptions };
