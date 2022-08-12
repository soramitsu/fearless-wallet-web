import type { AssetJson, FiatJson, Networks, TokensPriceJson } from './types';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { Subscription } from 'rxjs';

export type State = {
  networks: Networks;
  tokensPriceJson: TokensPriceJson;
  assets: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
  subscriptionsBalances: Subscription[];
  allNetworksIsLoaded: boolean;
};

const state = (): State => {
  return {
    networks: [],
    tokensPriceJson: {},
    assets: [],
    fiats: [],
    currencies: [],
    subscriptionsBalances: [],
    allNetworksIsLoaded: false,
    history: {},
  };
};

export default state;
