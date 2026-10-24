import type { NetworkJson } from '@extension-base/types';
import type { UniversalWalletChainRegistry } from '@/util/universalWalletRegistryContract';
import { UNIVERSAL_WALLET_INDEXERS, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
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
      chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId,
      ecosystem: WalletEcosystem.Iroha,
      externalApi: { history: { type: 'iroha', url: 'https://taira.sora.org' } },
    });
    expect(byName['Taira Testnet'].assets[0]).toMatchObject({
      id: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id,
      precision: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.decimals,
      symbol: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.symbol,
    });
    expect(byName['SORA Nexus']).toMatchObject({
      active: false,
      disabled: true,
      externalApi: { history: { type: 'iroha', url: 'https://minamoto.sora.org' } },
    });
    expect(byName['SORA Nexus'].nodes[0]).toMatchObject({
      name: 'sora-nexus-mainnet-torii',
      url: 'https://minamoto.sora.org',
    });
  });

  it('supplements missing networks and corrects stale registry-backed history endpoints', () => {
    const solana = createUniversalWalletRegistryNetworks().find(({ name }) => name === 'Solana')!;
    const taira = createUniversalWalletRegistryNetworks().find(({ name }) => name === 'Taira Testnet')!;
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
      'Taira Testnet': {
        ...taira,
        chainId: UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId.toUpperCase(),
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
    expect(networkMap['Taira Testnet'].chainId).toBe(UNIVERSAL_WALLET_IROHA_NETWORKS.taira.chainId);
  });

  it('names, prices and pictures USDC and USDT on Solana mainnet, and on no test network', () => {
    const byName = Object.fromEntries(createUniversalWalletRegistryNetworks().map((network) => [network.name, network]));
    const [sol, ...tokens] = byName.Solana.assets;

    expect(sol).toMatchObject({ isNative: true, symbol: 'SOL' });
    expect(tokens).toEqual([
      expect.objectContaining({
        currencyId: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        id: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        name: 'USD Coin',
        precision: 6,
        priceId: 'usd-coin',
        symbol: 'USDC',
        type: WalletEcosystem.Solana,
      }),
      expect.objectContaining({
        currencyId: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        id: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
        name: 'Tether USD',
        precision: 6,
        priceId: 'tether',
        symbol: 'USDT',
      }),
    ]);
    expect(tokens.every(({ icon, isNative, isUtility }) => icon.startsWith('https://') && !isNative && !isUtility)).toBe(true);
    expect((byName['Solana Devnet']?.assets ?? []).map(({ symbol }) => symbol)).not.toContain('USDC');
  });

  it('adds the Solana registry tokens to a stored network once and keeps an entry it already has', () => {
    const solana = createUniversalWalletRegistryNetworks().find(({ name }) => name === 'Solana')!;
    const [sol, , usdt] = solana.assets;
    const stored: NetworkJson = { ...solana, assets: [sol, { ...usdt, name: 'Stored Tether' }] };
    const networkMap: Record<string, NetworkJson> = { Solana: stored };

    mergeUniversalWalletRegistryNetworks(networkMap, { Solana: stored });
    mergeUniversalWalletRegistryNetworks(networkMap, { Solana: networkMap.Solana });

    expect(networkMap.Solana.assets.map(({ symbol }) => symbol)).toEqual(['SOL', 'USDT', 'USDC']);
    expect(networkMap.Solana.assets.find(({ symbol }) => symbol === 'USDT')?.name).toBe('Stored Tether');
  });

  it('never prices test-network coins as their mainnet namesakes', () => {
    const networks = createUniversalWalletRegistryNetworks();
    const byName = Object.fromEntries(networks.map((network) => [network.name, network]));

    expect(byName.Bitcoin.assets[0].priceId).toBe('btc');
    // CoinGecko serves SOL as `solana`; `sol` is not one of its ids, so it must not be the price id.
    expect(byName.Solana.assets[0].priceId).toBe('solana');
    expect(byName['Solana Devnet']?.assets[0].priceId ?? '').toBe('');
    expect(byName['Bitcoin Testnet'].assets[0].priceId).toBe('');
    expect(byName['Taira Testnet'].assets[0].priceId).toBe('');

    const taira = byName['Taira Testnet'];
    const networkMap: Record<string, NetworkJson> = {
      'Taira Testnet': { ...taira, assets: [{ ...taira.assets[0], priceId: 'xor' }] },
    };

    mergeUniversalWalletRegistryNetworks(networkMap, {});

    expect(networkMap['Taira Testnet'].assets[0].priceId).toBe('');
  });

  it('gives registry coins published icons and upgrades bare stored icons only', () => {
    const icons = 'https://raw.githubusercontent.com/soramitsu/shared-features-utils/master/icons';
    const networks = createUniversalWalletRegistryNetworks();
    const byName = Object.fromEntries(networks.map((network) => [network.name, network]));

    expect(byName['Taira Testnet'].icon).toBe(`${icons}/chains/white/SORA.svg`);
    expect(byName['Taira Testnet'].assets[0].icon).toBe(`${icons}/tokens/coloured/XOR.svg`);
    expect(byName['Bitcoin Testnet'].icon).toBe(`${icons}/tokens/coloured/BTC.svg`);
    expect(byName['Bitcoin Testnet'].assets[0].icon).toBe(`${icons}/tokens/coloured/BTC.svg`);
    // shared-features-utils publishes no SOL icon, so the extension bundles one.
    expect(byName.Solana.icon).toBe('/icons/tokens/coloured/SOL.svg');
    expect(byName.Solana.assets[0].icon).toBe('/icons/tokens/coloured/SOL.svg');

    const taira = byName['Taira Testnet'];
    const bitcoin = byName.Bitcoin;
    const customIcon = 'https://example.org/btc.svg';
    const networkMap: Record<string, NetworkJson> = {
      Bitcoin: { ...bitcoin, icon: customIcon, assets: [{ ...bitcoin.assets[0], icon: customIcon }] },
      'Taira Testnet': { ...taira, icon: 'xor', assets: [{ ...taira.assets[0], icon: 'xor' }] },
    };

    mergeUniversalWalletRegistryNetworks(networkMap, {});

    expect(networkMap['Taira Testnet'].icon).toBe(`${icons}/chains/white/SORA.svg`);
    expect(networkMap['Taira Testnet'].assets[0].icon).toBe(`${icons}/tokens/coloured/XOR.svg`);
    expect(networkMap.Bitcoin.icon).toBe(customIcon);
    expect(networkMap.Bitcoin.assets[0].icon).toBe(customIcon);

    const solana = byName.Solana;
    const solanaMap: Record<string, NetworkJson> = {
      Solana: { ...solana, icon: 'sol', assets: [{ ...solana.assets[0], icon: 'sol' }] },
    };

    mergeUniversalWalletRegistryNetworks(solanaMap, {});

    expect(solanaMap.Solana.icon).toBe('/icons/tokens/coloured/SOL.svg');
    expect(solanaMap.Solana.assets[0].icon).toBe('/icons/tokens/coloured/SOL.svg');
  });

  it('gives every network built from the registry its own token objects', () => {
    const solana = () => createUniversalWalletRegistryNetworks().find(({ name }) => name === 'Solana')!;
    const [, usdc] = solana().assets;

    usdc.name = 'Edited elsewhere';

    expect(solana().assets[1].name).toBe('USD Coin');
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

    expect(() => createUniversalWalletRegistryNetworks(invalidRegistry)).toThrow('invalid_universal_wallet_registry');
  });
});
