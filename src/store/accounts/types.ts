import type { Currencies } from '@/interfaces/currencies';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';
import type { WalletAddress, NetworkName } from '@/interfaces';

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
export type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

export type SetAccountsProps = {
  accounts: Accounts;
};

export type SetAddressesProps = {
  addresses: Accounts;
};

export type SetAutoSelectNode = {
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

export interface IWallet {
  type: string;
  json: {
    address: string;
    meta: {
      name: string;
    };
  };
}
