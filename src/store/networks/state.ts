import type { AssetsPrice, History, FiatJson } from '@/interfaces';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

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
