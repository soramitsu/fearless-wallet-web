import type { NetworkJson } from '@extension-base/types';
import type { History, FiatJson, SoraFees } from '@/interfaces';
import type { BasePriceJson } from '@/extension/background/extension-base/src/background/types/types';

export type State = {
  allNetworks: NetworkJson[];
  assetsPrice: BasePriceJson;
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
