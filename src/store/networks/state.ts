import { Networks, AssetsJson, TokensPrice } from './types';
import { Currencies } from '@/interfaces/currencies';
import { Subscription } from 'rxjs';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
  assets: AssetsJson[];
  currencies: Currencies;
  subscriptionsBalances: Subscription[];
};

const state = (): State => {
  return {
    networks: [],
    tokensPrice: {},
    assets: [],
    currencies: {},
    subscriptionsBalances: [],
  };
};

export default state;
