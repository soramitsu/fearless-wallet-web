const ETHEREUM_NETWORKS = ['moonbeam', 'moonriver', 'moonbase alpha', 'astarEvm', 'shidenEvm'];
const ETHEREUM_DEFAULT_DERIVATION_PATH = "/m/44'/60'/0'/0/0";

const NOT_SUPPORTED_ALL_TRANSFER_NETWORKS = ['karura', 'acala', 'acala_testnet'];

const RELAY_CHAINS = ['polkadot', 'kusama', 'westend', 'rococo'];
const NATIVE_PARACHAINS = ['statemint', 'statemine', 'encointer on kusama', 'westmint', 'rockmine'];
const NATIVE_NETWORKS = [...RELAY_CHAINS, ...NATIVE_PARACHAINS];

export {
  ETHEREUM_NETWORKS,
  ETHEREUM_DEFAULT_DERIVATION_PATH,
  RELAY_CHAINS,
  NATIVE_NETWORKS,
  NATIVE_PARACHAINS,
  NOT_SUPPORTED_ALL_TRANSFER_NETWORKS,
};
