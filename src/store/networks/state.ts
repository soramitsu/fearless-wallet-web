import type { NetworkJson } from '@extension-base/types';
import type { AssetsPrice, History, FiatJson, SoraFees } from '@/interfaces';

export type State = {
  networks: NetworkJson[];
  assetsPrice: AssetsPrice;
  fiats: FiatJson[];
  history: History;
  soraFees: Nullable<SoraFees>;
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
    soraFees: null,
  };
};

export default state;
