import type { KeypairType } from '@subwallet/keyring/types';

const ETHEREUM_DEFAULT_DERIVATION_PATH = "/m/44'/60'/0'/0/0";

const INITIAL_DERIVATION_PATHS = {
  substrate: {
    value: '',
    keypairType: 'sr25519' as KeypairType,
  },
  ethereum: {
    value: '',
    keypairType: 'ethereum' as KeypairType,
  },
};

const VALID_MNEMONIC = 'follow group ski turtle dad bleak relief cry tray fat roast life';

export { ETHEREUM_DEFAULT_DERIVATION_PATH, INITIAL_DERIVATION_PATHS, VALID_MNEMONIC };
