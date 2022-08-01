import type { AssetsJson, Networks, TokensPrice } from './types';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { Subscription } from 'rxjs';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
  assets: AssetsJson[];
  history: History;
  currencies: Currencies;
  subscriptionsBalances: Subscription[];
  allNetworksIsLoaded: boolean;
};

const state = (): State => {
  return {
    networks: [],
    tokensPrice: {},
    assets: [],
    currencies: [],
    subscriptionsBalances: [],
    allNetworksIsLoaded: false,
    history: {},
  };
};

export default state;
