import type { NetworkJson } from '@extension-base/types';
import type { AssetsPrice, History, FiatJson, SoraFees } from '@/interfaces';

export type State = {
  allNetworks: NetworkJson[];
  assetsPrice: AssetsPrice;
  fiats: FiatJson[];
  history: History;
  soraFees: Nullable<SoraFees>;
};

export const state = (): State => {
  return {
    allNetworks: [],
    assetsPrice: {
      tokenPriceChange: {},
      tokenPriceMap: {},
    },
    fiats: [],
    history: {},
    soraFees: null,
  };
};
