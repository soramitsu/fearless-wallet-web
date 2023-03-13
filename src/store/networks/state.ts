import type { Networks, AssetsPrice, Currencies, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';

export type State = {
  networks: Networks;
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
