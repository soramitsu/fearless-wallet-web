import type { KeypairType } from '@polkadot/util-crypto/types';

export interface SelectedWallet {
  address: string;
  ethereumAddress: string;
  name: string;
  type: KeypairType | '';
}

export type SetPasswordProps = {
  password: string;
};

export type SetSelectedWalletProps = {
  selectedWalletAddress: string;
};
