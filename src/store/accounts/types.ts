import type { Currencies } from '@/interfaces/currencies';
import type { SingleAddress, SubjectInfo } from '@polkadot/ui-keyring/observable/types';

export interface Wallet {
  address: string;
  ethereumAddress: string;
  isBeaconConnected?: boolean;
}

export interface SelectedWallet extends Wallet {
  name: string;
}
export interface AccountInfo extends SingleAddress {
  isBeaconConnected?: boolean;
}
interface ExtendedSubjectInfo {
  [index: string]: AccountInfo;
}

export type Accounts = ExtendedSubjectInfo;

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

// actions
export type SetSelectedFiat = {
  fiatName: string;
};

export type SetSelectedWallet = {
  selectedWalletAddress: string;
};
