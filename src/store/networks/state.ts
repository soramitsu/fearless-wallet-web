import type { Networks, TokensPrice, Currencies, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
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
    tokensPrice: {},
    assetsJson: [],
    fiats: [],
    currencies: [],
    allNetworksIsLoaded: false,
    history: {},
    activeNodes: {},
  };
};

export default state;
