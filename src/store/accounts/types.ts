export interface Wallet {
  address: string;
  ethereumAddress: string;
}

export interface SelectedWallet extends Wallet {
  name: string;
}

export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};
