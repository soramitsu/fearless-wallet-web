import type { KeypairType } from '@polkadot/util-crypto/types';

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
const VALID_SUBSTRATE_ADDRESS = '5CXD5sbhRRR7vGrNzrXyU39oHUdLJJStKsyEF99Xop1qiL9J';

export { INITIAL_DERIVATION_PATHS, VALID_SUBSTRATE_ADDRESS, VALID_MNEMONIC };
