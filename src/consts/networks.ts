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

export {
  ETHEREUM_NETWORKS,
  MAIN_NETWORKS,
  RELAY_CHAINS,
  NATIVE_NETWORKS,
  NATIVE_PARACHAINS,
  NOT_SUPPORTED_ALL_TRANSFER_NETWORKS,
};
