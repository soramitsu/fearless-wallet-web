import type { AssetsPrice, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';

export type State = {
  networks: NetworkJsonOld[];
  assetsPrice: AssetsPrice;
  assetsJson: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: TokenBalance[];
  activeNodes: ActiveNodes;
  assetsPriceInterval: NodeJS.Timer | null;
};

const state = (): State => {
  return {
    networks: [],
    assetsPrice: {},
    assetsJson: [],
    fiats: [],
    currencies: [],
    history: {},
    activeNodes: {},
    assetsPriceInterval: null,
  };
};

export default state;
