import { Networks, AssetsJson, TokensPrice } from './types';
import { Currencies } from '@/interfaces/currencies';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
  assets: AssetsJson[];
  currencies: Currencies;
};

const state = (): State => {
  return {
    networks: [],
    tokensPrice: {},
    assets: [],
    currencies: {},
  };
};

export default state;
