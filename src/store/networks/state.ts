import type { AssetJson, FiatJson, Networks, TokensPriceJson } from './types';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { ActiveNodes } from '@/store/networks/types';

export type State = {
  networks: Networks;
  tokensPriceJson: TokensPriceJson;
  assets: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
  allNetworksIsLoaded: boolean;
  activeNodes: ActiveNodes;
};

const state = (): State => {
  return {
    networks: [],
    tokensPriceJson: {},
    assets: [],
    fiats: [],
    currencies: [],
    allNetworksIsLoaded: false,
    history: {},
    activeNodes: {},
  };
};

export default state;
