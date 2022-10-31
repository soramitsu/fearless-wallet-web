const ETHEREUM_NETWORKS = ['moonbeam', 'moonriver', 'moonbase alpha', 'astarEvm', 'shidenEvm'];
const NOT_SUPPORTED_ALL_TRANSFER_NETWORKS = ['karura', 'acala', 'acala_testnet'];

const RELAY_CHAINS = ['polkadot', 'kusama', 'westend', 'rococo'];
const NATIVE_PARACHAINS = ['statemint', 'statemine', 'encointer on kusama', 'westmint', 'rockmine'];
const NATIVE_NETWORKS = [...RELAY_CHAINS, ...NATIVE_PARACHAINS];

const NOT_SUPPORTED_SUBQUERY_NETWORKS = [
  'kico',
  'quartz',
  'kabocha',
  'efinity',
  'litentry',
  'parallel',
  'centrifuge',
  'parallel heiko',
  'pichiu network',
  'integritee shell',
  'composable finance',
  'dorafactory network',
  'datahighway tanganika',
];

const MAIN_NETWORKS: Record<string, string> = {
  dot: 'polkadot',
  ksm: 'kusama',
  wnd: 'westend',
  roc: 'rococo',
};

const ETHEREUM_ADDRESS_LENGTH = 42;
const ETHEREUM_ADDRESS_PREFIX = '0x';
const AUTO_CONNECT_MS = 3000;
const MAX_CONTINUE_RETRY = 2;

const WESTEND_GENESISHASH = '0xe143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e';
const MOONBEAM_GENESISHASH = '0xfe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d';

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
  NOT_SUPPORTED_SUBQUERY_NETWORKS,
  NOT_SUPPORTED_ALL_TRANSFER_NETWORKS,
  WESTEND_GENESISHASH,
  MOONBEAM_GENESISHASH,
};
