import type { NetworkJson } from '@extension-base/types';
import type { AssetsPrice, History, FiatJson } from '@/interfaces';

export type State = {
  networks: NetworkJson[];
  assetsPrice: AssetsPrice;
  fiats: FiatJson[];
  history: History;
};

const state = (): State => {
  return {
    networks: [],
    assetsPrice: {
      tokenPriceChange: {},
      tokenPriceMap: {},
    },
    fiats: [],
    history: {},
  };
};

export default state;
