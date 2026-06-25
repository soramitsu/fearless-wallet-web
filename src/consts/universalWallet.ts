import { WalletEcosystem } from '@/interfaces';
import {
  UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION,
  type UniversalWalletChainRegistry,
  type UniversalWalletChainRegistryEntry,
} from '@/util/universalWalletRegistryContract';

const UNIVERSAL_WALLET_INDEXERS = {
  bitcoin: {
    mainnet: 'https://blockstream.info/api',
    testnet: 'https://blockstream.info/testnet/api',
  },
  ton: 'https://ti.soramitsu.io',
  solana: 'https://si.soramitsu.io',
} as const;

const UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
} as const;

const UNIVERSAL_WALLET_DEFAULT_WORD_COUNT = 24;

const UNIVERSAL_WALLET_DERIVATION_PATHS = {
  substrateRoot: '',
  evmDefault: "m/44'/60'/0'/0/0",
  bitcoinMainnetAccount: "m/84'/0'/0'",
  bitcoinMainnetFirstReceive: "m/84'/0'/0'/0/0",
  bitcoinTestnetAccount: "m/84'/1'/0'",
  bitcoinTestnetFirstReceive: "m/84'/1'/0'/0/0",
  solanaDefault: "m/44'/501'/0'/0'",
  tonDefault: "m/44'/607'/0'/0'/0'",
  irohaDefault: "m/44'/617'/0'/0'",
} as const;

const UNIVERSAL_WALLET_IROHA_NETWORKS = {
  taira: {
    id: 'taira-testnet',
    chainId: 'iroha3-taira',
    chainDiscriminant: 369,
    toriiBaseUrl: 'https://taira.sora.org',
    mcpPath: '/v1/mcp',
    enabledByDefault: true,
  },
  nexus: {
    id: 'sora-nexus-mainnet',
    chainId: 'sora:nexus:global',
    chainDiscriminant: 753,
    toriiBaseUrl: 'https://minamoto.sora.org',
    mcpPath: '/v1/mcp',
    enabledByDefault: false,
  },
} as const;

const UNIVERSAL_WALLET_TAIRA_MCP_URL =
  `${UNIVERSAL_WALLET_IROHA_NETWORKS.taira.toriiBaseUrl}${UNIVERSAL_WALLET_IROHA_NETWORKS.taira.mcpPath}`;
const UNIVERSAL_WALLET_NEXUS_MCP_URL =
  `${UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.toriiBaseUrl}${UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.mcpPath}`;

const UNIVERSAL_WALLET_BITCOIN_NETWORKS = {
  mainnet: {
    id: 'bitcoin-mainnet',
    chainId: 'bitcoin:mainnet',
    name: 'Bitcoin',
    slip44CoinType: 0,
    addressHrp: 'bc',
    accountPath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetAccount,
    firstReceivePath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinMainnetFirstReceive,
    defaultGapLimit: 20,
    enabledByDefault: true,
    nativeAsset: {
      id: 'BTC',
      symbol: 'BTC',
      decimals: 8,
    },
  },
  testnet: {
    id: 'bitcoin-testnet',
    chainId: 'bitcoin:testnet',
    name: 'Bitcoin Testnet',
    slip44CoinType: 1,
    addressHrp: 'tb',
    accountPath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinTestnetAccount,
    firstReceivePath: UNIVERSAL_WALLET_DERIVATION_PATHS.bitcoinTestnetFirstReceive,
    defaultGapLimit: 20,
    enabledByDefault: false,
    nativeAsset: {
      id: 'BTC',
      symbol: 'BTC',
      decimals: 8,
    },
  },
} as const;

const UNIVERSAL_WALLET_SOLANA_NETWORKS = {
  mainnet: {
    id: 'solana-mainnet',
    chainId: 'solana:mainnet',
    name: 'Solana',
    indexerUrl: UNIVERSAL_WALLET_INDEXERS.solana,
    rpcUrl: UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS.mainnet,
    historyApi: {
      type: 'solana',
      url: UNIVERSAL_WALLET_INDEXERS.solana,
    },
    enabledByDefault: true,
    nativeAsset: {
      id: 'SOL',
      symbol: 'SOL',
      decimals: 9,
    },
  },
  devnet: {
    id: 'solana-devnet',
    chainId: 'solana:devnet',
    name: 'Solana Devnet',
    indexerUrl: UNIVERSAL_WALLET_INDEXERS.solana,
    rpcUrl: UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS.devnet,
    historyApi: {
      type: 'solana',
      url: UNIVERSAL_WALLET_INDEXERS.solana,
    },
    enabledByDefault: false,
    nativeAsset: {
      id: 'SOL',
      symbol: 'SOL',
      decimals: 9,
    },
  },
} as const;

const UNIVERSAL_WALLET_BITCOIN_MAINNET_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.id,
  ecosystem: WalletEcosystem.Bitcoin,
  chainId: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.chainId,
  displayName: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.name,
  enabledByDefault: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.enabledByDefault,
  nativeAsset: {
    ...UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.nativeAsset,
    name: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.name,
  },
  derivationPath: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.accountPath,
  slip44CoinType: UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.slip44CoinType,
  endpoints: [
    {
      id: 'bitcoin-mainnet-indexer',
      kind: 'indexer',
      url: UNIVERSAL_WALLET_INDEXERS.bitcoin.mainnet,
      readOnly: true,
    },
  ],
};

const UNIVERSAL_WALLET_BITCOIN_TESTNET_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.id,
  ecosystem: WalletEcosystem.Bitcoin,
  chainId: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.chainId,
  displayName: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.name,
  enabledByDefault: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.enabledByDefault,
  nativeAsset: {
    ...UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.nativeAsset,
    name: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.name,
  },
  derivationPath: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.accountPath,
  slip44CoinType: UNIVERSAL_WALLET_BITCOIN_NETWORKS.testnet.slip44CoinType,
  endpoints: [
    {
      id: 'bitcoin-testnet-indexer',
      kind: 'indexer',
      url: UNIVERSAL_WALLET_INDEXERS.bitcoin.testnet,
      readOnly: true,
    },
  ],
};

const UNIVERSAL_WALLET_TON_MAINNET_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: 'ton-mainnet',
  ecosystem: WalletEcosystem.Ton,
  chainId: 'ton:mainnet',
  displayName: 'TON',
  enabledByDefault: true,
  nativeAsset: {
    id: 'TON',
    symbol: 'TON',
    decimals: 9,
    name: 'Toncoin',
  },
  derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.tonDefault,
  slip44CoinType: 607,
  endpoints: [
    {
      id: 'ton-mainnet-indexer',
      kind: 'indexer',
      url: UNIVERSAL_WALLET_INDEXERS.ton,
      readOnly: true,
    },
  ],
};

const UNIVERSAL_WALLET_SOLANA_MAINNET_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.id,
  ecosystem: WalletEcosystem.Solana,
  chainId: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.chainId,
  displayName: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.name,
  enabledByDefault: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.enabledByDefault,
  nativeAsset: {
    ...UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.nativeAsset,
    name: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.name,
  },
  derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault,
  slip44CoinType: 501,
  endpoints: [
    {
      id: 'solana-mainnet-indexer',
      kind: 'indexer',
      url: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.indexerUrl,
      readOnly: true,
    },
    {
      id: 'solana-mainnet-rpc',
      kind: 'rpc',
      url: UNIVERSAL_WALLET_SOLANA_NETWORKS.mainnet.rpcUrl,
      readOnly: false,
      priority: 1,
    },
  ],
};

const UNIVERSAL_WALLET_SOLANA_DEVNET_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.id,
  ecosystem: WalletEcosystem.Solana,
  chainId: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.chainId,
  displayName: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.name,
  enabledByDefault: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.enabledByDefault,
  nativeAsset: {
    ...UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.nativeAsset,
    name: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.name,
  },
  derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.solanaDefault,
  slip44CoinType: 501,
  endpoints: [
    {
      id: 'solana-devnet-indexer',
      kind: 'indexer',
      url: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.indexerUrl,
      readOnly: true,
    },
    {
      id: 'solana-devnet-rpc',
      kind: 'rpc',
      url: UNIVERSAL_WALLET_SOLANA_NETWORKS.devnet.rpcUrl,
      readOnly: false,
      priority: 1,
    },
  ],
};

const UNIVERSAL_WALLET_TAIRA_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.id,
  ecosystem: WalletEcosystem.Iroha,
  chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId,
  displayName: 'Taira Testnet',
  enabledByDefault: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.enabledByDefault,
  derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
  slip44CoinType: 617,
  features: ['transfer'],
  endpoints: [
    {
      id: 'taira-testnet-torii-mcp',
      kind: 'torii-mcp',
      url: UNIVERSAL_WALLET_TAIRA_MCP_URL,
      readOnly: false,
    },
  ],
};

const UNIVERSAL_WALLET_NEXUS_REGISTRY_ENTRY: UniversalWalletChainRegistryEntry = {
  id: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.id,
  ecosystem: WalletEcosystem.Iroha,
  chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.chainId,
  displayName: 'SORA Nexus',
  enabledByDefault: UNIVERSAL_WALLET_IROHA_NETWORKS.nexus.enabledByDefault,
  derivationPath: UNIVERSAL_WALLET_DERIVATION_PATHS.irohaDefault,
  slip44CoinType: 617,
  features: ['transfer', 'offline-cash', 'sccp', 'governance'],
  endpoints: [
    {
      id: 'sora-nexus-mainnet-torii-mcp',
      kind: 'torii-mcp',
      url: UNIVERSAL_WALLET_NEXUS_MCP_URL,
      readOnly: false,
    },
  ],
};

const UNIVERSAL_WALLET_CHAIN_REGISTRY: UniversalWalletChainRegistry = {
  schemaVersion: UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION,
  chains: [
    UNIVERSAL_WALLET_BITCOIN_MAINNET_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_BITCOIN_TESTNET_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_TON_MAINNET_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_SOLANA_MAINNET_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_SOLANA_DEVNET_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_TAIRA_REGISTRY_ENTRY,
    UNIVERSAL_WALLET_NEXUS_REGISTRY_ENTRY,
  ],
};

export {
  UNIVERSAL_WALLET_CHAIN_REGISTRY,
  UNIVERSAL_WALLET_INDEXERS,
  UNIVERSAL_WALLET_SOLANA_RPC_ENDPOINTS,
  UNIVERSAL_WALLET_DEFAULT_WORD_COUNT,
  UNIVERSAL_WALLET_DERIVATION_PATHS,
  UNIVERSAL_WALLET_BITCOIN_NETWORKS,
  UNIVERSAL_WALLET_IROHA_NETWORKS,
  UNIVERSAL_WALLET_SOLANA_NETWORKS,
};
