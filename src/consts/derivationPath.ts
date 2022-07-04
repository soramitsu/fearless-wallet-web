import type { DerivationPath } from '@/interfaces/common';

export const DEFAULT_DERIVATION_PATH: DerivationPath = {
  substrate: {
    value: '',
    keyPair: 'sr25519',
  },
  ethereum: {
    value: '',
    keyPair: 'ethereum',
  },
};
