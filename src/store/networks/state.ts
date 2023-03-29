import type { AssetsPrice, History, FiatJson } from '@/interfaces';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';

export type State = {
  networks: NetworkJsonOld[];
  assetsPrice: AssetsPrice;
  fiats: FiatJson[];
  history: History;
  currencies: TokenBalance[];
};

const state = (): State => {
  return {
    networks: [],
    assetsPrice: {
      tokenPriceChange: {},
      tokenPriceMap: {},
    },
    fiats: [],
    currencies: [],
    history: {},
  };
};

export default state;
