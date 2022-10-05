import type { Networks, AssetsPrice, Currencies, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';

export type State = {
  networks: Networks;
  assetsPrice: AssetsPrice;
  assetsJson: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
  allNetworksIsLoaded: boolean;
  activeNodes: ActiveNodes;
};

const state = (): State => {
  return {
    networks: [],
    assetsPrice: {},
    assetsJson: [],
    fiats: [],
    currencies: [],
    allNetworksIsLoaded: false,
    history: {},
    activeNodes: {},
  };
};

export default state;
