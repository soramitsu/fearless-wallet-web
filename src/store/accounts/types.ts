import type { Currencies } from '@/interfaces/currencies';

export interface Wallet {
  address: string;
  ethereumAddress: string;
}

export interface SelectedWallet extends Wallet {
  name: string;
}

// mutations
export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};

export type SetSelectedFiatProps = {
  fiatName: string;
  currencies: Currencies;
};

// actions
export type SetSelectedFiat = {
  fiatName: string;
};
