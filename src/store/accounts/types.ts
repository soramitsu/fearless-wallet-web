export interface SelectedWallet {
  address: string;
  ethereumAddress: string;
  name: string;
}

export type SetPasswordProps = {
  password: string;
};

export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};
