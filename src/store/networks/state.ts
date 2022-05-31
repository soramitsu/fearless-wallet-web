import { Networks, AssetsJson, TokensPrice } from './types';
import { Currencies } from '@/interfaces/currencies';
import { Subscription } from 'rxjs';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
  assets: AssetsJson[];
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
  };
};

export default state;
