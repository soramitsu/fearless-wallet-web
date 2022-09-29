import type { AssetJson } from '@/interfaces/assets';
import type { TypeAsset } from '@/interfaces/currencies';
import NetworksController from '@/controllers/networksController';

const ASSETS_OPTIONS: Record<TypeAsset, Record<string, Record<string, any>>> = {
  stableAssetPoolToken: {
    tdot: { StableAssetPoolToken: '0' },
    taiksm: { StableAssetPoolToken: '0' },
  },
  liquidCrowdloan: {
    lcdot: { LiquidCrowdloan: '13' },
  },
  foreignAsset: {},
  vsToken: {
    ksm: { VSToken: 'KSM' },
  },
  vToken: {
    ksm: { VToken: 'KSM' },
  },
  stable: {
    kusd: { Stable: 'KUSD' },
  },
  ormlAsset: {},
  ormlChain: {},
  equilibrium: {},
  native: {},
};

function getOptions(symbol: string, type: TypeAsset, assetId: string) {
  if (type === 'foreignAsset') {
    const assetsJson: AssetJson[] = NetworksController.getAssetsJson();
    const { currencyId } = assetsJson.find(({ id }) => id === assetId)!; // eslint-disable-line

    return { ForeignAsset: currencyId };
  }

  const specialOption = ASSETS_OPTIONS[type][symbol];

  return specialOption ?? { Token: symbol.toUpperCase() };
}

export { ASSETS_OPTIONS, getOptions };
