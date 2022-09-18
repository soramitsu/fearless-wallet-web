import type { Networks } from '@/interfaces/networks';
import type { TokensPriceJson } from '@/interfaces/tokens';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { FiatJson } from '@/interfaces/common';
import type { AssetJson } from '@/interfaces/assets';
import type { ActiveNodes } from '@/interfaces/nodes';

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
