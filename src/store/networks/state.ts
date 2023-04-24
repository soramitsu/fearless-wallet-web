import type { Networks, AssetsPrice, Currencies, History, FiatJson, AssetJson, ActiveNodes } from '@/interfaces';
import type { Subscription } from 'rxjs';

export type State = {
  networks: Networks;
  assetsPrice: AssetsPrice;
  assetsJson: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
  activeNodes: ActiveNodes;
  assetsPriceInterval: NodeJS.Timer | null;
  totalXorSubscription: Subscription | null;
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
    totalXorSubscription: null,
  };
};

export default state;
