import type { Networks } from '@/interfaces/networks';
import type { AssetsPrice, AssetJson } from '@/interfaces/assets';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { FiatJson } from '@/interfaces/common';
import type { ActiveNodes } from '@/interfaces/nodes';

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
