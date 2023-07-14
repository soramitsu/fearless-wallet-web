import { IS_PRODUCTION } from '@/consts/global';
import { NetworkName } from '@/interfaces';

const NOT_SUPPORTED_ALL_TRANSFER_NETWORKS = ['karura', 'acala', 'acala_testnet'];
const SUBSTRATE_ETHEREUM_NETWORKS = ['moonbeam', 'moonriver', 'moonbase alpha', 'astarEvm', 'shidenEvm'];
const ETHEREUM_NETWORKS = [...SUBSTRATE_ETHEREUM_NETWORKS, 'ethereum', 'ethereum_gorli'];
const RELAY_CHAINS = ['polkadot', 'kusama', 'westend', 'rococo'];
const NATIVE_PARACHAINS = [
  'statemint',
  'polkadot assethub',
  'statemine',
  'kusama assethub',
  'encointer on kusama',
  'westmint',
  'rockmine',
];
const NATIVE_NETWORKS = [...RELAY_CHAINS, ...NATIVE_PARACHAINS];
const ALL_NETWORKS = 'All';

const POLKADOT_ID = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA_ID = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';

const CHAIN_IDS: Record<string, NetworkName> = {
  [POLKADOT_ID]: 'Polkadot',
  [KUSAMA_ID]: 'Kusama',
};

const NETWORKS_ALIASES: Record<string, string> = {
  'polkadot assethub': 'statemint',
  'kusama assethub': 'statemine',
  bifrost: 'bifrost kusama',
};

// названия сетей должны быть в таком же регистре, как и в json
const MAIN_NETWORKS: Record<string, string> = {
  dot: 'Polkadot',
  ksm: 'Kusama',
  ethereum: 'Ethereum',
  ethereum_goerli: 'Ethereum_goerli',
  wnd: 'Westend',
  roc: 'Rococo',
};

const ETHEREUM_ADDRESS_LENGTH = 42;
const ETHEREUM_ADDRESS_PREFIX = '0x';
const AUTO_CONNECT_MS = 6000;
const MAX_CONTINUE_RETRY = 3;

const WESTEND_GENESISHASH = '0xe143f23803ac50e8f6f8e62695d1ce9e4e1d68aa36c1cd2cfd15340213f3423e';
const MOONBEAM_GENESISHASH = '0xfe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d';

const VALID_SUBSTRATE_ADDRESS = '5GsGqbQ2692eBUzbAUznPr84ikvuFavYmkDXdQEndzHkMFaH';
const VALID_ETHEREUM_ADDRESS = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

const SORA_MAINNET = 'sora mainnet';
const SORA_TEST = 'sora test';
const SORA_NETWORK_NAME = IS_PRODUCTION ? SORA_MAINNET : SORA_TEST;
const SORA_XOR_ASSET_ID = IS_PRODUCTION
  ? 'b774c386-5cce-454a-a845-1ec0381538ec'
  : 'b5a44630-920e-43ee-809f-61890d0888b0';
const SORA_UTILITY_ASSET = 'xor';

export {
  ALL_NETWORKS,
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
  VALID_SUBSTRATE_ADDRESS,
  VALID_ETHEREUM_ADDRESS,
  POLKADOT_ID,
  KUSAMA_ID,
  CHAIN_IDS,
  SORA_MAINNET,
  SORA_TEST,
  NETWORKS_ALIASES,
  SUBSTRATE_ETHEREUM_NETWORKS,
};
