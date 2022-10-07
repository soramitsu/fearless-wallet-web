import type { Currencies } from '@/interfaces/currencies';
import type { SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export interface Wallet {
  address: string;
  ethereumAddress: string;
}

export interface SelectedWallet extends Wallet {
  name: string;
}

export type Accounts = SubjectInfo;

// mutations
export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};

export type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

export type setAccountsProps = {
  accounts: Accounts;
};

export type setAddressesProps = {
  addresses: Accounts;
};

// actions
export type SetSelectedFiat = {
  fiatName: string;
};

export type SetSelectedWallet = {
  selectedWalletAddress: string;
};
