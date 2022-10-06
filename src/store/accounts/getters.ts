import type { GetterTree } from 'vuex';
import type { SelectedWallet, Accounts } from './types';
import type { State } from './state';
import type { FiatJson } from '@/interfaces';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import store from '@/store';

export enum GettersTypes {
  getSelectedWallet = 'getSelectedWallet',
  getSelectedFiat = 'getSelectedFiat',
  getFiatSymbol = 'getFiatSymbol',
  getAccounts = 'getAccounts',
  getAddresses = 'getAddresses',
  getWallets = 'getWallets',
}
interface Account {
  name: string;
  address: string;
  isMobile: boolean;
}
interface Wallet {
  type: string;
  json: {
    address: string;
    meta: {
      name: string;
    };
  };
}
export type Getters = {
  [GettersTypes.getSelectedWallet](state: State, getters?: GetterTree<State, State> & Getters): SelectedWallet;
  [GettersTypes.getSelectedFiat](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getFiatSymbol](state: State, getters?: GetterTree<State, State> & Getters): string;
  [GettersTypes.getAccounts](state: State, getters?: GetterTree<State, State> & Getters): Accounts;
  [GettersTypes.getAddresses](state: State, getters?: GetterTree<State, State> & Getters): Accounts;
  [GettersTypes.getWallets](state: State, getters?: GetterTree<State, State> & Getters): Account[];
};

const getters: GetterTree<State, State> & Getters = {
  [GettersTypes.getSelectedWallet]({ selectedWallet }): SelectedWallet {
    return selectedWallet;
  },
  [GettersTypes.getSelectedFiat]({ selectedFiat }): string {
    return selectedFiat;
  },
  [GettersTypes.getFiatSymbol]({ selectedFiat }): string {
    const fiats: FiatJson[] = store.getters[NetworksGettersTypes.getFiats];
    const fiat = fiats.find(({ id }) => id === selectedFiat);

    return fiat?.symbol ?? '';
  },
  [GettersTypes.getAccounts]({ accounts }): Accounts {
    return accounts;
  },
  [GettersTypes.getAddresses]({ addresses }): Accounts {
    return addresses;
  },
  [GettersTypes.getWallets]({ addresses, accounts }): Account[] {
    const wallets: Account[] = [];
    (Object.values(accounts) as any).forEach((wallet: Wallet) => {
      if (wallet.type !== 'ethereum')
        wallets.push({
          name: wallet.json.meta.name,
          address: wallet.json.address,
          isMobile: false,
        });
    });

    (Object.values(addresses) as any).forEach((wallet: Wallet) => {
      if (wallet.type !== 'etherium') {
        const account: Account = {
          name: wallet.json.meta.name,
          address: wallet.json.address,
          isMobile: true,
        };
        wallets.push(account);
      }
    });

    return wallets;
  },
};

export default getters;
