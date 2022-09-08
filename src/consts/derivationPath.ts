import type { KeypairType } from '@polkadot/util-crypto/types';

export const INITIAL_DERIVATION_PATHS = {
  substrate: {
    value: '',
    keypairType: 'sr25519' as KeypairType,
  },
  ethereum: {
    value: '',
    keypairType: 'ethereum' as KeypairType,
  },
};

export const VALID_MNEMONIC = 'follow group ski turtle dad bleak relief cry tray fat roast life';
