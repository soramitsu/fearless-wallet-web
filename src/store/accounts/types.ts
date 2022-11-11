import type { Currencies } from '@/interfaces/currencies';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { WalletAddress } from '@/interfaces';

export interface Wallet {
  address: string;
  ethereumAddress: string;
}

export interface SelectedWallet extends Wallet {
  name: string;
}

export type SelectedNetworks = Record<WalletAddress, string>;

export type Accounts = SubjectInfo;

// mutations
export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};

export type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

export type SetSelectedNetworkProps = {
  network: string;
};

export type setAccountsProps = {
  accounts: Accounts;
};

export type setAddressesProps = {
  addresses: Accounts;
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
