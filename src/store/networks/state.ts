import type { Networks } from '@/interfaces/networks';
import type { TokensPrice } from '@/interfaces/tokens';
import type { Currencies } from '@/interfaces/currencies';
import type { History } from '@/interfaces/history';
import type { FiatJson } from '@/interfaces/common';
import type { AssetJson } from '@/interfaces/assets';
import type { ActiveNodes } from '@/interfaces/nodes';

export type State = {
  networks: Networks;
  tokensPrice: TokensPrice;
  assetsJson: AssetJson[];
  fiats: FiatJson[];
  history: History;
  currencies: Currencies;
  allNetworksIsLoaded: boolean;
  activeNodes: ActiveNodes;
};

const state = (): State => {
  return {
    networks: [],
    tokensPrice: {},
    assetsJson: [],
    fiats: [],
    currencies: [],
    allNetworksIsLoaded: false,
    history: {},
    activeNodes: {},
  };
};

export default state;
