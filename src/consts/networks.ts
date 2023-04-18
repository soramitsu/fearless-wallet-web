import { IS_PRODUCTION } from '@/consts/global';

const ETHEREUM_NETWORKS = ['moonbeam', 'moonriver', 'moonbase alpha', 'astarEvm', 'shidenEvm'];
const NOT_SUPPORTED_ALL_TRANSFER_NETWORKS = ['karura', 'acala', 'acala_testnet'];

const RELAY_CHAINS = ['polkadot', 'kusama', 'westend', 'rococo'];
const NATIVE_PARACHAINS = ['statemint', 'statemine', 'encointer on kusama', 'westmint', 'rockmine'];
const NATIVE_NETWORKS = [...RELAY_CHAINS, ...NATIVE_PARACHAINS];

const MAIN_NETWORKS: Record<string, string> = {
  dot: 'polkadot',
  ksm: 'kusama',
  wnd: 'westend',
  roc: 'rococo',
};

const ETHEREUM_ADDRESS_LENGTH = 42;
const ETHEREUM_ADDRESS_PREFIX = '0x';
const AUTO_CONNECT_MS = 6000;
const MAX_CONTINUE_RETRY = 3;

const WESTEND_GENESISHASH = '0xe143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e';
const MOONBEAM_GENESISHASH = '0xfe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d';

const SORA_NETWORK_NAME = IS_PRODUCTION ? 'sora mainnet' : 'sora test';
const SORA_XOR_ASSET_ID = IS_PRODUCTION
  ? 'b774c386-5cce-454a-a845-1ec0381538ec'
  : 'b5a44630-920e-43ee-809f-61890d0888b0';
const SORA_UTILITY_ASSET = 'xor';

export {
  RELAY_CHAINS,
  MAIN_NETWORKS,
  NATIVE_NETWORKS,
  AUTO_CONNECT_MS,
  NATIVE_PARACHAINS,
  ETHEREUM_NETWORKS,
  ETHEREUM_ADDRESS_PREFIX,
  ETHEREUM_ADDRESS_LENGTH,
  MAX_CONTINUE_RETRY,
  NOT_SUPPORTED_ALL_TRANSFER_NETWORKS,
  WESTEND_GENESISHASH,
  MOONBEAM_GENESISHASH,
  SORA_NETWORK_NAME,
  SORA_UTILITY_ASSET,
  SORA_XOR_ASSET_ID,
};
