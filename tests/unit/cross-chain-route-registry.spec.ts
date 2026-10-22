import { APIItemState } from '@extension-base/api/types/networks';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import {
  buildCrossChainProviderCapabilities,
  buildOwnedCrossChainAssets,
  buildReviewedCrossChainRoutes,
  buildUnavailableCrossChainRoutes,
} from '@/cross-chain/routeRegistry';
import { defineReviewedCrossChainRoute, type CrossChainRouteProviderId } from '@/cross-chain/reviewedRoutes';

const execution = (originChainId: string, destinationChainId: string, assetId: string) => ({
  kind: 'relay-native-xcm-v3' as const,
  originChainId,
  destinationChainId,
  assetXcmId: assetId,
  assetPrecision: 6,
  pallet: 'polkadotXcm' as const,
  call: 'limitedReserveTransferAssets' as const,
  callCandidates: [
    {
      pallet: 'polkadotXcm' as const,
      call: 'limitedReserveTransferAssets' as const,
      args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'],
    },
  ],
  destinationFee: '0',
  relayNetwork: 'Polkadot' as const,
  destinationParaId: 2000,
  receiverKind: 'AccountId32' as const,
  assetParents: 0 as const,
  assetInteriors: [],
});

const asset = (id: string, symbol = 'USDT') => ({
  color: '#fff',
  icon: symbol.toLowerCase(),
  id,
  name: `${symbol} ${id}`,
  precision: 6,
  providers: [],
  staking: '',
  symbol,
  tonType: 'normal',
  type: 'normal',
});

const network = (
  name: string,
  chainId: string,
  assets: ReturnType<typeof asset>[],
  destinations: Array<{ chainId: string; assetIds: string[] }> = []
): NetworkJson =>
  ({
    active: true,
    assets,
    chainId,
    ecosystem: 'substrate',
    favorite: [],
    icon: name.toLowerCase(),
    key: name,
    name,
    options: name.includes('SORA') ? ['polkaswap'] : [],
    xcm: {
      availableAssets: assets.map(({ id, symbol }) => ({ id, interiors: [], symbol, versions: ['v3'] })),
      availableDestinations: destinations.map((destination) => ({
        assets: destination.assetIds.map((id) => ({
          id,
          interiors: [],
          symbol: assets.find((item) => item.id === id)?.symbol ?? 'USDT',
          versions: ['v3'],
        })),
        bridgeParachainId: '',
        chainId: destination.chainId,
      })),
      xcmVersion: 'v3',
    },
  }) as unknown as NetworkJson;

const group = (groupId: string, assetId: string): TokenGroup =>
  ({
    balances: [
      {
        id: assetId,
        name: 'Origin',
        state: APIItemState.READY,
        symbol: 'USDT',
        total: '10',
        transferable: '10',
      },
    ],
    groupId,
    icon: 'usdt',
    mainNetwork: 'Origin',
    providers: [],
    relayChain: 'polkadot',
    symbol: 'USDT',
    tokenName: 'USDT',
  }) as TokenGroup;

const reviewedRoute = ({
  originChainId,
  destinationChainId,
  assetId,
  providerId = 'wallet-xcm',
  minimum = null,
  symbol = 'USDT',
}: {
  originChainId: string;
  destinationChainId: string;
  assetId: string;
  providerId?: CrossChainRouteProviderId;
  minimum?: string | null;
  symbol?: string;
}) =>
  defineReviewedCrossChainRoute({
    providerId,
    originChainId,
    destinationChainId,
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
    originAssetId: assetId,
    assetKeyAssetId: assetId,
    originXcmAssetId: assetId,
    destinationXcmAssetId: assetId,
    symbol,
    precision: 6,
    minimum,
    execution: providerId === 'wallet-xcm' ? execution(originChainId, destinationChainId, assetId) : undefined,
  });

describe('reviewed cross-chain route registry', () => {
  it('derives all four provider capabilities without wallet, network, or asset inputs', () => {
    const providers = buildCrossChainProviderCapabilities({
      crossChainLiberland: true,
      crossChainSoraBridge: true,
      crossChainXcm: true,
    });

    expect(providers.map(({ id }) => id)).toEqual([
      'wallet-xcm',
      'sora-substrate-bridge',
      'sora-evm-bridge',
      'liberland-bridge',
    ]);
    expect(providers.find(({ id }) => id === 'wallet-xcm')).toMatchObject({ availability: 'available' });
    expect(providers.find(({ id }) => id === 'wallet-xcm')?.reviewedRouteCount).toBeGreaterThan(0);
    expect(providers.find(({ id }) => id === 'sora-substrate-bridge')).toMatchObject({
      availability: 'available',
    });
    expect(providers.find(({ id }) => id === 'sora-substrate-bridge')?.reviewedRouteCount).toBeGreaterThan(0);
    expect(providers.find(({ id }) => id === 'sora-evm-bridge')).toMatchObject({
      availability: 'unavailable',
      reason: expect.stringContaining('claim and recovery flow'),
      reviewedRouteCount: 0,
    });
    expect(providers.find(({ id }) => id === 'liberland-bridge')).toMatchObject({ availability: 'available' });
    expect(providers.find(({ id }) => id === 'liberland-bridge')?.reviewedRouteCount).toBeGreaterThan(0);
  });

  it('distinguishes policy-disabled providers from providers without executable authority', () => {
    const providers = buildCrossChainProviderCapabilities({});

    expect(providers.filter(({ availability }) => availability === 'action-disabled')).toHaveLength(3);
    expect(providers.find(({ id }) => id === 'wallet-xcm')?.reason).toContain('current capability policy');
    expect(providers.find(({ id }) => id === 'sora-evm-bridge')).toMatchObject({
      availability: 'unavailable',
      reason: expect.stringContaining('No reviewed executable'),
    });
  });

  it('matches assets by canonical ID and never by a shared symbol', () => {
    const origin = network(
      'Origin',
      'origin-chain',
      [asset('token-a'), asset('token-b')],
      [{ chainId: 'destination-chain', assetIds: ['token-b'] }]
    );
    const destination = network('Destination', 'destination-chain', [asset('token-b')]);
    const owned = buildOwnedCrossChainAssets(
      [group('legacy-usdt-a', 'token-a'), group('legacy-usdt-b', 'token-b')],
      [origin, destination]
    );
    const first = owned.find(({ assetId }) => assetId === 'token-a')!;
    const second = owned.find(({ assetId }) => assetId === 'token-b')!;
    const reviewedRoutes = [
      reviewedRoute({
        originChainId: origin.chainId,
        destinationChainId: destination.chainId,
        assetId: 'token-b',
      }),
    ];

    expect(
      buildReviewedCrossChainRoutes({
        asset: first,
        origin,
        networks: [origin, destination],
        actions: {},
        reviewedRoutes,
      })
    ).toEqual([]);

    const routes = buildReviewedCrossChainRoutes({
      asset: second,
      origin,
      networks: [origin, destination],
      actions: { crossChainXcm: true },
      reviewedRoutes,
    });

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      assetId: 'token-b',
      destinationNetwork: 'Destination',
      enabled: true,
      providerId: 'wallet-xcm',
      xcmAssetId: 'token-b',
    });
  });

  it('keeps reviewed destinations visible while a remote action switch disables mutation', () => {
    const origin = network(
      'Origin',
      'origin-chain',
      [asset('dot', 'DOT')],
      [{ chainId: 'destination-chain', assetIds: ['dot'] }]
    );
    const destination = network('Destination', 'destination-chain', [asset('dot', 'DOT')]);
    const [owned] = buildOwnedCrossChainAssets([group('dot', 'dot')], [origin, destination]);
    const reviewedRoutes = [
      defineReviewedCrossChainRoute({
        providerId: 'wallet-xcm',
        originChainId: origin.chainId,
        destinationChainId: destination.chainId,
        originEcosystem: 'substrate',
        destinationEcosystem: 'substrate',
        originAssetId: 'dot',
        assetKeyAssetId: 'dot',
        originXcmAssetId: 'dot',
        destinationXcmAssetId: 'dot',
        symbol: 'DOT',
        precision: 6,
        minimum: null,
        execution: execution(origin.chainId, destination.chainId, 'dot'),
      }),
    ];
    const [route] = buildReviewedCrossChainRoutes({
      asset: owned,
      origin,
      networks: [origin, destination],
      actions: { crossChainXcm: false },
      reviewedRoutes,
    });

    expect(route).toMatchObject({
      disabledReason: expect.stringContaining('temporarily disabled'),
      enabled: false,
      minimum: null,
    });
  });

  it('does not expose bridge definitions without bundled execution authority', () => {
    const sora = network(
      'SORA Mainnet',
      'sora-chain',
      [asset('dot', 'DOT')],
      [
        { chainId: 'polkadot-chain', assetIds: ['dot'] },
        { chainId: 'liberland-chain', assetIds: ['dot'] },
      ]
    );
    const polkadot = network('Polkadot', 'polkadot-chain', [asset('dot', 'DOT')]);
    const liberland = network('Liberland', 'liberland-chain', [asset('dot', 'DOT')]);
    const soraGroup = group('dot', 'dot');

    soraGroup.balances[0].name = 'SORA Mainnet';
    const [owned] = buildOwnedCrossChainAssets([soraGroup], [sora, polkadot, liberland]);
    const reviewedRoutes = [
      reviewedRoute({
        originChainId: sora.chainId,
        destinationChainId: polkadot.chainId,
        assetId: 'dot',
        providerId: 'sora-substrate-bridge',
        symbol: 'DOT',
      }),
      reviewedRoute({
        originChainId: sora.chainId,
        destinationChainId: liberland.chainId,
        assetId: 'dot',
        providerId: 'liberland-bridge',
        symbol: 'DOT',
      }),
    ];
    const routes = buildReviewedCrossChainRoutes({
      asset: owned,
      origin: sora,
      networks: [sora, polkadot, liberland],
      actions: { crossChainLiberland: true, crossChainSoraBridge: true },
      reviewedRoutes,
    });

    expect(routes).toEqual([]);
  });

  it('keeps the exact legacy SORA → Ethereum capability visible but non-actionable', () => {
    const soraChainId = '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5';
    const soraEthId = '82f45df3-b6d8-43e7-a440-c0e73ab59785';
    const soraEthCurrencyId = '0x0200070000000000000000000000000000000000000000000000000000000000';
    const ethereumEthId = 'c2a6c062-d511-4bde-9ce6-ea775d2a302c';
    const soraEth = { ...asset(soraEthId, 'ETH'), currencyId: soraEthCurrencyId, precision: 18 };
    const ethereumEth = { ...asset(ethereumEthId, 'ETH'), precision: 18 };
    const sora = network('SORA Mainnet', soraChainId, [soraEth]);
    const ethereum = network('Ethereum', '1', [ethereumEth]);
    ethereum.ecosystem = WalletEcosystem.Evm as unknown as NetworkJson['ecosystem'];
    const soraGroup = group('eth', soraEthId);
    soraGroup.balances[0].name = sora.name;
    soraGroup.balances[0].currencyId = soraEthCurrencyId;
    soraGroup.balances[0].symbol = 'ETH';
    const [owned] = buildOwnedCrossChainAssets([soraGroup], [sora, ethereum]);

    const [route] = buildUnavailableCrossChainRoutes({ asset: owned, origin: sora, networks: [sora, ethereum] });

    expect(route).toMatchObject({
      destinationNetwork: 'Ethereum',
      disabledReason: expect.stringContaining('second claim transaction'),
      enabled: false,
      protocol: 'SORA ↔ Ethereum legacy bridge',
      providerId: 'sora-evm-bridge',
    });
  });

  it('normalizes the actual EVM ecosystem enum for reviewed EVM-based origins', () => {
    const origin = network(
      'EVM origin',
      'evm-origin-chain',
      [asset('dot', 'DOT')],
      [{ chainId: 'substrate-destination-chain', assetIds: ['dot'] }]
    );
    origin.ecosystem = WalletEcosystem.Evm as unknown as NetworkJson['ecosystem'];
    const destination = network('Substrate destination', 'substrate-destination-chain', [asset('dot', 'DOT')]);
    const token = group('dot', 'dot');
    token.balances[0].name = origin.name;
    const [owned] = buildOwnedCrossChainAssets([token], [origin, destination]);
    const route = defineReviewedCrossChainRoute({
      providerId: 'wallet-xcm',
      originChainId: origin.chainId,
      destinationChainId: destination.chainId,
      originEcosystem: 'evm',
      destinationEcosystem: 'substrate',
      originAssetId: 'dot',
      assetKeyAssetId: 'dot',
      originXcmAssetId: 'dot',
      destinationXcmAssetId: 'dot',
      symbol: 'DOT',
      precision: 6,
      minimum: null,
      execution: execution(origin.chainId, destination.chainId, 'dot'),
    });

    expect(
      buildReviewedCrossChainRoutes({
        asset: owned,
        origin,
        networks: [origin, destination],
        actions: { crossChainXcm: true },
        reviewedRoutes: [route],
      })
    ).toHaveLength(1);
  });

  it('does not infer a provider from attacker-controlled network names or options', () => {
    const origin = network(
      'SORA Injected Name',
      'origin-chain',
      [asset('dot', 'DOT')],
      [{ chainId: 'destination-chain', assetIds: ['dot'] }]
    );
    const destination = network('Liberland Injected Name', 'destination-chain', [asset('dot', 'DOT')]);
    const token = group('dot', 'dot');
    token.balances[0].name = origin.name;
    const [owned] = buildOwnedCrossChainAssets([token], [origin, destination]);
    const reviewedRoutes = [
      defineReviewedCrossChainRoute({
        providerId: 'wallet-xcm',
        originChainId: origin.chainId,
        destinationChainId: destination.chainId,
        originEcosystem: 'substrate',
        destinationEcosystem: 'substrate',
        originAssetId: 'dot',
        assetKeyAssetId: 'dot',
        originXcmAssetId: 'dot',
        destinationXcmAssetId: 'dot',
        symbol: 'DOT',
        precision: 6,
        minimum: null,
        execution: execution(origin.chainId, destination.chainId, 'dot'),
      }),
    ];

    expect(
      buildReviewedCrossChainRoutes({
        asset: owned,
        origin,
        networks: [origin, destination],
        actions: { crossChainXcm: true },
        reviewedRoutes,
      })[0].providerId
    ).toBe('wallet-xcm');
  });
});
