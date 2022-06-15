import { Networks, AssetsJson, TokensPrice } from './types';
import { History } from '@/interfaces/history';
import { Currencies } from '@/interfaces/currencies';
import { Subscription } from 'rxjs';

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
    currencies: {},
    subscriptionsBalances: [],
    allNetworksIsLoaded: false,
    history: {},
  };
};

export default state;
