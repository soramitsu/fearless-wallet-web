import { WalletEcosystem } from '@/interfaces';
import { UNIVERSAL_WALLET_CHAIN_REGISTRY } from '@/consts/universalWallet';
import {
  UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION,
  validateUniversalWalletChainRegistry,
  validateUniversalWalletChainRegistryEntry,
  type UniversalWalletChainRegistry,
  type UniversalWalletChainRegistryEntry,
  type UniversalWalletRegistryEndpoint,
} from '@/util/universalWalletRegistryContract';

describe('Universal Wallet registry contract', () => {
  it('validates and serializes public chain registry entries', () => {
    const registry: UniversalWalletChainRegistry = {
      schemaVersion: UNIVERSAL_WALLET_REGISTRY_SCHEMA_VERSION,
      chains: [solanaMainnet(), taira()],
    };

    expect(validateUniversalWalletChainRegistry(registry)).toEqual([]);
    expect(JSON.stringify(registry)).toContain('"ecosystem":"solana"');
    expect(JSON.stringify(registry)).toContain('"kind":"indexer"');
    expect(JSON.stringify(registry)).toContain('"kind":"torii-mcp"');
    expect(JSON.stringify(registry)).toContain('"readOnly":true');
    expect(JSON.stringify(registry)).toContain('"features":["transfer"]');
  });

  it('allows disabled gated networks without endpoints', () => {
    const nexus: UniversalWalletChainRegistryEntry = {
      id: 'sora-nexus-mainnet',
      ecosystem: WalletEcosystem.Iroha,
      chainId: 'sora:nexus:global',
      displayName: 'SORA Nexus',
      enabledByDefault: false,
      features: ['transfer', 'offline-cash', 'sccp', 'governance'],
      endpoints: [],
    };

    expect(validateUniversalWalletChainRegistryEntry(nexus)).toEqual([]);
  });

  it('validates actual default registry entries and exposes expected public endpoints', () => {
    expect(validateUniversalWalletChainRegistry(UNIVERSAL_WALLET_CHAIN_REGISTRY)).toEqual([]);
    expect(UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        'bitcoin-mainnet',
        'bitcoin-testnet',
        'ton-mainnet',
        'solana-mainnet',
        'solana-devnet',
        'taira-testnet',
        'sora-nexus-mainnet',
      ])
    );

    const bitcoin = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'bitcoin-mainnet');
    expect(bitcoin?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'indexer',
          readOnly: true,
          url: 'https://blockstream.info/api',
        }),
      ])
    );

    const bitcoinTestnet = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'bitcoin-testnet');
    expect(bitcoinTestnet?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'indexer',
          readOnly: true,
          url: 'https://blockstream.info/testnet/api',
        }),
      ])
    );

    const solana = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'solana-mainnet');
    expect(solana?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'indexer',
          readOnly: true,
          url: 'https://si.soramitsu.io',
        }),
        expect.objectContaining({
          kind: 'rpc',
          readOnly: false,
          url: 'https://api.mainnet-beta.solana.com',
        }),
      ])
    );

    const ton = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'ton-mainnet');
    expect(ton?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'indexer',
          readOnly: true,
          url: 'https://ti.soramitsu.io',
        }),
      ])
    );

    const taira = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'taira-testnet');
    expect(taira?.features).toEqual(['transfer']);
    expect(taira?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'torii-mcp',
          readOnly: false,
          url: 'https://taira.sora.org/v1/mcp',
        }),
      ])
    );

    const nexus = UNIVERSAL_WALLET_CHAIN_REGISTRY.chains.find(({ id }) => id === 'sora-nexus-mainnet');
    expect(nexus?.enabledByDefault).toBe(false);
    expect(nexus?.features).toEqual(['transfer', 'offline-cash', 'sccp', 'governance']);
    expect(nexus?.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'torii-mcp',
          readOnly: false,
          url: 'https://minamoto.sora.org/v1/mcp',
        }),
      ])
    );
  });

  it('rejects malformed registry entries and public write indexers', () => {
    const chain: UniversalWalletChainRegistryEntry = {
      ...solanaMainnet(),
      id: '../bad',
      ecosystem: 'unknown',
      chainId: 'bad chain',
      displayName: 'bad\u0000name',
      nativeAsset: {
        id: 'bad id',
        symbol: 'sol',
        decimals: 256,
        name: 'bad\u0000name',
      },
      derivationPath: "m/44'/x",
      slip44CoinType: -1,
      features: ['governance', 'governance', 'bad feature'],
      endpoints: [
        {
          id: 'bad endpoint',
          kind: 'indexer',
          url: 'http://si.soramitsu.io',
          readOnly: false,
          priority: -1,
        },
      ],
    };

    expect(validateUniversalWalletChainRegistryEntry(chain)).toEqual(
      expect.arrayContaining([
        'invalidId',
        'invalidEcosystem',
        'invalidChainId',
        'invalidDisplayName',
        'invalidAssetId',
        'invalidAssetSymbol',
        'invalidAssetDecimals',
        'invalidAssetName',
        'invalidDerivationPath',
        'invalidSlip44CoinType',
        'duplicateFeatureId',
        'invalidFeatureId',
        'invalidEndpointId',
        'invalidEndpointUrl',
        'invalidEndpointPriority',
        'publicWriteIndexer',
      ])
    );
  });

  it('rejects registry endpoint URLs with credentials, parameters, fragments, or non-local HTTP', () => {
    const unsafeUrls = [
      'https://user:token@blockstream.info/api',
      'https://blockstream.info/api?apiKey=secret',
      'https://blockstream.info/api#secret',
      'http://blockstream.info/api',
      'http://192.168.1.10/api',
      'https://blockstream.info/api with-space',
    ];

    unsafeUrls.forEach((url) => {
      expect(validateUniversalWalletChainRegistryEntry({ ...solanaMainnet(), endpoints: [{ ...indexer(), url }] })).toEqual(
        expect.arrayContaining(['invalidEndpointUrl'])
      );
    });

    expect(
      validateUniversalWalletChainRegistryEntry({
        ...solanaMainnet(),
        endpoints: [{ ...indexer(), url: 'http://localhost:3000/api' }],
      })
    ).toEqual([]);
    expect(
      validateUniversalWalletChainRegistryEntry({
        ...solanaMainnet(),
        endpoints: [{ ...indexer(), url: 'http://127.0.0.1:3000/api' }],
      })
    ).toEqual([]);
  });

  it('rejects duplicate chain and endpoint identifiers', () => {
    const duplicateEndpoint: UniversalWalletChainRegistryEntry = {
      ...solanaMainnet(),
      endpoints: [indexer(), indexer()],
    };
    const registry: UniversalWalletChainRegistry = {
      schemaVersion: 99,
      chains: [solanaMainnet(), solanaMainnet(), duplicateEndpoint],
    };

    expect(validateUniversalWalletChainRegistry(registry)).toEqual(
      expect.arrayContaining(['invalidSchemaVersion', 'duplicateChainId', 'duplicateEndpointId'])
    );
  });
});

function solanaMainnet(): UniversalWalletChainRegistryEntry {
  return {
    id: 'solana-mainnet',
    ecosystem: WalletEcosystem.Solana,
    chainId: 'solana:mainnet',
    displayName: 'Solana',
    enabledByDefault: true,
    nativeAsset: {
      id: 'SOL',
      symbol: 'SOL',
      decimals: 9,
      name: 'Solana',
    },
    derivationPath: "m/44'/501'/0'/0'",
    slip44CoinType: 501,
    endpoints: [
      indexer(),
      {
        id: 'solana-mainnet-rpc',
        kind: 'rpc',
        url: 'https://api.mainnet-beta.solana.com',
        readOnly: false,
        priority: 1,
      },
    ],
  };
}

function taira(): UniversalWalletChainRegistryEntry {
  return {
    id: 'taira-testnet',
    ecosystem: WalletEcosystem.Iroha,
    chainId: 'iroha3-taira',
    displayName: 'Taira Testnet',
    enabledByDefault: true,
    features: ['transfer'],
    endpoints: [
      {
        id: 'taira-torii-mcp',
        kind: 'torii-mcp',
        url: 'https://taira.sora.org/v1/mcp',
        readOnly: false,
      },
    ],
  };
}

function indexer(): UniversalWalletRegistryEndpoint {
  return {
    id: 'solana-mainnet-indexer',
    kind: 'indexer',
    url: 'https://si.soramitsu.io',
    readOnly: true,
  };
}
