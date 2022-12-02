import type { Networks, AssetsPrice, Currencies, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';

export type State = {
  networks: Networks;
  assetsPrice: AssetsPrice;
  assetsJson: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
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
