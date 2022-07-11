import type { KeypairType } from '@polkadot/util-crypto/types';

export const INITIAL_DERIVATION_PATH = {
  substrate: {
    value: '',
    keyPair: 'sr25519' as KeypairType,
  },
  ethereum: {
    value: '',
    keyPair: 'ethereum' as KeypairType,
  },
};
