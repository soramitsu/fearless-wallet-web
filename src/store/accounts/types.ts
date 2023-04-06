import type { Currencies } from '@/interfaces/currencies';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { WalletAddress, NetworkName } from '@/interfaces';
import type { ActionContext } from 'vuex';
import type { Mutations } from '@/store/accounts/mutations';
import type { State } from '@/store/accounts/state';

export interface Wallet {
  address: string;
  ethereumAddress: string;
}

export interface SelectedWallet extends Wallet {
  name: string;
}

export type SelectedNetworks = Record<WalletAddress, string>;
export type Accounts = SubjectInfo;
export type AutoSelectNode = Record<NetworkName, boolean>;
export type GetAutoSelectNodesValueByNetwork = (networkName: string) => boolean;
export type GetShowWarningNetworks = (assetId: string) => boolean;

// mutations
type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

type SetAccountsProps = {
  accounts: Accounts;
};

type SetAddressesProps = {
  addresses: Accounts;
};

type SetAutoSelectNode = {
  network: string;
  value: boolean;
};

// actions
export interface WalletInfo {
  name: string;
  address: string;
  isMobile: boolean;
  active: boolean;
}

interface IWallet {
  type: string;
  json: {
    address: string;
    meta: {
      name: string;
    };
  };
}

type AugmentedAccountContext = {
  commit<K extends keyof Mutations>(key: K, payload: Parameters<Mutations[K]>[1]): ReturnType<Mutations[K]>;
} & Omit<ActionContext<State, any>, 'commit'>;

export {
  AugmentedAccountContext,
  IWallet,
  SetAddressesProps,
  SetAutoSelectNode,
  SetSelectedFiatProps,
  SetAccountsProps,
};
