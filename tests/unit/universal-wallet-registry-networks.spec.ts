import type { NetworkJson } from '@extension-base/types';
import type { UniversalWalletChainRegistry } from '@/util/universalWalletRegistryContract';
import { UNIVERSAL_WALLET_INDEXERS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import {
  createUniversalWalletRegistryNetworks,
  mergeUniversalWalletRegistryNetworks,
} from '@/util/universalWalletRegistryNetworks';

describe('Universal Wallet registry network mapping', () => {
  it('creates runtime network entries from the shared registry defaults', () => {
    const networks = createUniversalWalletRegistryNetworks();
    const byName = Object.fromEntries(networks.map((network) => [network.name, network]));

    expect(byName.Bitcoin).toMatchObject({
      chainId: 'bitcoin:mainnet',
      ecosystem: WalletEcosystem.Bitcoin,
      externalApi: { history: { type: 'bitcoin', url: UNIVERSAL_WALLET_INDEXERS.bitcoin.mainnet } },
    });
    expect(byName['Bitcoin Testnet']).toMatchObject({
      chainId: 'bitcoin:testnet',
      disabled: true,
      externalApi: { history: { type: 'bitcoin', url: UNIVERSAL_WALLET_INDEXERS.bitcoin.testnet } },
    });
    expect(byName.Solana).toMatchObject({
      chainId: 'solana:mainnet',
      ecosystem: WalletEcosystem.Solana,
      externalApi: { history: { type: 'solana', url: UNIVERSAL_WALLET_INDEXERS.solana } },
    });
    expect(byName.Solana.nodes[0]).toMatchObject({
      name: 'solana-mainnet-rpc',
      url: 'https://api.mainnet-beta.solana.com',
    });
    expect(byName['ton mainnet']).toMatchObject({
      chainId: 'ton:mainnet',
      ecosystem: WalletEcosystem.Ton,
      externalApi: { history: { type: 'ton', url: UNIVERSAL_WALLET_INDEXERS.ton } },
    });
    expect(byName['Taira Testnet']).toMatchObject({
      chainId: 'iroha3-taira',
      ecosystem: WalletEcosystem.Iroha,
      externalApi: { history: { type: 'iroha', url: 'https://taira.sora.org/v1/mcp' } },
    });
    expect(byName['SORA Nexus']).toMatchObject({
      active: false,
      disabled: true,
      externalApi: { history: { type: 'iroha', url: 'https://minamoto.sora.org/v1/mcp' } },
    });
    expect(byName['SORA Nexus'].nodes[0]).toMatchObject({
      name: 'sora-nexus-mainnet-torii-mcp',
      url: 'https://minamoto.sora.org/v1/mcp',
    });
  });

  it('supplements missing networks and corrects stale registry-backed history endpoints', () => {
    const solana = createUniversalWalletRegistryNetworks().find(({ name }) => name === 'Solana')!;
    const networkMap: Record<string, NetworkJson> = {
      Solana: {
        ...solana,
        assets: [],
        customNodes: [{ name: 'custom', url: 'https://custom.solana.example' }],
        externalApi: {
          history: {
            type: 'solana',
            url: 'https://stale.example',
          },
        } as NetworkJson['externalApi'],
        favorite: ['old-address'],
      },
    };

    mergeUniversalWalletRegistryNetworks(networkMap, {
      Solana: {
        ...solana,
        favorite: ['stored-address'],
      },
    });

    expect(networkMap.Solana.externalApi?.history?.url).toBe(UNIVERSAL_WALLET_INDEXERS.solana);
    expect(networkMap.Solana.assets.some(({ symbol }) => symbol === 'SOL')).toBe(true);
    expect(networkMap.Solana.customNodes).toEqual([{ name: 'custom', url: 'https://custom.solana.example' }]);
    expect(networkMap.Solana.favorite).toEqual(['stored-address']);
    expect(networkMap.Bitcoin.chainId).toBe('bitcoin:mainnet');
    expect(networkMap['Taira Testnet'].chainId).toBe('iroha3-taira');
  });

  it('fails closed when registry validation fails', () => {
    const invalidRegistry = {
      schemaVersion: 1,
      chains: [
        {
          id: 'bad',
          ecosystem: 'solana',
          chainId: 'solana:mainnet',
          displayName: 'Solana',
          enabledByDefault: true,
          endpoints: [
            {
              id: 'bad-indexer',
              kind: 'indexer',
              readOnly: false,
              url: 'https://si.soramitsu.io',
            },
          ],
        },
      ],
    } as UniversalWalletChainRegistry;

    expect(() => createUniversalWalletRegistryNetworks(invalidRegistry)).toThrow(
      'invalid_universal_wallet_registry'
    );
  });
});
