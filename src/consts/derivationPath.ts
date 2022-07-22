import type { KeypairType } from '@polkadot/util-crypto/types';

export const INITIAL_DERIVATION_PATH = {
  substrate: {
    value: '',
    keypairType: 'sr25519' as KeypairType,
  },
  ethereum: {
    value: '',
    keypairType: 'ethereum' as KeypairType,
  },
};
