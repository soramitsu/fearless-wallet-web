import type { Currencies } from '@/interfaces/currencies';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { WalletAddress, NetworkName } from '@/interfaces';
import { AccountJson } from '@/extension/background/extension-base/src/background/types';

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

// mutations
export type SetSelectedWalletProps = {
  selectedWallet: SelectedWallet;
};

export type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

export type SetSelectedNetworkProps = {
  network: string;
};

export type setAccountsProps = {
  accounts: AccountJson[];
};

export type setAddressesProps = {
  addresses: Accounts;
};

export type setAutoSelectNode = {
  network: string;
  value: boolean;
};

export type setOnlineStatus = {
  isOnline: boolean;
};

// actions
export type SetSelectedFiat = {
  fiatName: string;
};

export type SetSelectedWallet = {
  selectedWalletAddress: string;
};

export interface WalletInfo {
  name: string;
  address: string;
  isMobile: boolean;
  active: boolean;
}

export interface IWallet {
  type: string;
  json: {
    address: string;
    meta: {
      name: string;
    };
  };
}
