import { DerivationPath } from '../interfaces/connectionWallet';

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
