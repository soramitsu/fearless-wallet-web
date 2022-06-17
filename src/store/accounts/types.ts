import type { KeypairType } from '@polkadot/util-crypto/types';

export interface SelectedWallet {
  address: string;
  ethereumAddress: string;
  name: string;
  type: KeypairType | '';
}
