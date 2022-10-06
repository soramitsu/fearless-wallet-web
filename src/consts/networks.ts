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

const AUTO_CONNECT_MS = 3000;
const MAX_CONTINUE_RETRY = 2;

export {
  RELAY_CHAINS,
  MAIN_NETWORKS,
  NATIVE_NETWORKS,
  AUTO_CONNECT_MS,
  NATIVE_PARACHAINS,
  ETHEREUM_NETWORKS,
  MAX_CONTINUE_RETRY,
  NOT_SUPPORTED_SUBQUERY_NETWORKS,
  NOT_SUPPORTED_ALL_TRANSFER_NETWORKS,
};
