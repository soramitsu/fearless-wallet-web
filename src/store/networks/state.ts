import { Networks } from './types';
import { Currencies } from '@/interfaces/currencies';

export type State = {
  networks: Networks;
  currencies: Currencies;
};

const state = (): State => {
  return {
    networks: [],
    currencies: {},
  };
};

export default state;
