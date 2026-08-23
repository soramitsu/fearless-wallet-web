import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { resolveCrossChainAssetId } from '@/cross-chain/resolveCrossChainAsset';
import { validateReviewedCrossChainRequest } from '@/cross-chain/requestValidation';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { defineReviewedCrossChainRoute } from '@/cross-chain/reviewedRoutes';

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

const network = (name: string, chainId: string, availableAssetIds: string[]): NetworkJson =>
  ({
    assets: availableAssetIds.map((id) => ({ id, precision: 6, symbol: 'USDT' })),
    chainId,
    ecosystem: 'substrate',
    name,
    xcm: {
      availableAssets: availableAssetIds.map((id) => ({ id, symbol: 'USDT' })),
      availableDestinations: [],
      xcmVersion: 'v3',
    },
  }) as unknown as NetworkJson;

const balance = (networkName: string, id: string): TokenGroup =>
  ({
    balances: [{ id, name: networkName, symbol: 'USDT', transferable: '10' }],
    groupId: id,
    icon: 'usdt',
    mainNetwork: networkName,
    providers: [],
    relayChain: 'polkadot',
    symbol: 'USDT',
    tokenName: 'USDT',
  }) as TokenGroup;

const reviewedRoute = (
  originChainId: string,
  destinationChainId: string,
  assetId: string,
  minimum: string | null = null
) =>
  defineReviewedCrossChainRoute({
    providerId: 'wallet-xcm',
    originChainId,
    destinationChainId,
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
    originAssetId: assetId,
    assetKeyAssetId: assetId,
    originXcmAssetId: assetId,
    destinationXcmAssetId: assetId,
    symbol: 'USDT',
    precision: 6,
    minimum,
    execution: execution(originChainId, destinationChainId, assetId),
  });

describe('cross-chain extrinsic route resolution', () => {
  it('resolves the reviewed XCM ID exactly instead of falling back to a shared symbol', () => {
    const origin = network('Origin', 'origin-chain', ['token-a', 'token-b']);
    const destination = network('Destination', 'destination-chain', ['token-b']);

    origin.xcm!.availableDestinations = [
      {
        assets: [{ id: 'token-b', symbol: 'USDT' }] as never,
        bridgeParachainId: '',
        chainId: destination.chainId,
      },
    ];

    expect(resolveCrossChainAssetId(origin, destination, 'token-b', balance('Origin', 'token-b'))).toBe('token-b');
    expect(() => resolveCrossChainAssetId(origin, destination, 'token-a', balance('Origin', 'token-a'))).toThrow(
      'cross_chain_asset_not_supported_at_destination'
    );
  });

  it('returns a deterministic capability error for a missing destination instead of dereferencing null', () => {
    const origin = network('Origin', 'origin-chain', ['dot']);
    const destination = network('Destination', 'destination-chain', ['dot']);

    expect(() => resolveCrossChainAssetId(origin, destination, 'dot', balance('Origin', 'dot'))).toThrow(
      'cross_chain_destination_not_reviewed'
    );
  });

  it('binds the provider switch and AssetKey to the reviewed origin/destination pair', () => {
    const origin = network('Origin', 'origin-chain', ['dot']);
    const destination = network('Destination', 'destination-chain', ['dot']);
    const token = balance('Origin', 'dot');
    const assetKey = createAssetKey({ ecosystem: 'substrate', chainId: 'origin-chain', assetId: 'dot' });
    const route = reviewedRoute(origin.chainId, destination.chainId, 'dot');

    origin.xcm!.availableDestinations = [
      {
        assets: [{ id: 'dot', symbol: 'USDT' }] as never,
        bridgeParachainId: '',
        chainId: destination.chainId,
      },
    ];

    expect(
      validateReviewedCrossChainRequest({
        routeId: route.id,
        assetId: 'dot',
        assetKey,
        destination,
        origin,
        providerId: 'wallet-xcm',
        tokenBalance: token,
        reviewedRoutes: [route],
      })
    ).toEqual({
      action: 'crossChainXcm',
      execution: route.execution,
      minimum: null,
      providerId: 'wallet-xcm',
      routeId: route.id,
      xcmAssetId: 'dot',
    });
    expect(() =>
      validateReviewedCrossChainRequest({
        routeId: route.id,
        assetId: 'dot',
        assetKey: `${assetKey}-forged`,
        destination,
        origin,
        providerId: 'wallet-xcm',
        tokenBalance: token,
        reviewedRoutes: [route],
      })
    ).toThrow('cross_chain_asset_key_mismatch');
    expect(() =>
      validateReviewedCrossChainRequest({
        routeId: route.id,
        assetId: 'dot',
        assetKey,
        destination,
        origin,
        providerId: 'sora-substrate-bridge',
        tokenBalance: token,
        reviewedRoutes: [route],
      })
    ).toThrow('cross_chain_provider_mismatch');
  });

  it('rejects forged route ids, same-symbol substitution, network bypasses, and amounts below the reviewed floor', () => {
    const origin = network('SORA-looking origin', 'origin-chain', ['token-a', 'token-b']);
    const destination = network('Liberland-looking destination', 'destination-chain', ['token-b']);
    origin.xcm!.availableDestinations = [
      {
        assets: [{ id: 'token-b', symbol: 'USDT' }] as never,
        bridgeParachainId: '',
        chainId: destination.chainId,
      },
    ];
    const route = reviewedRoute(origin.chainId, destination.chainId, 'token-b', '5');
    const token = balance(origin.name, 'token-b');
    const assetKey = createAssetKey({ ecosystem: 'substrate', chainId: origin.chainId, assetId: 'token-b' });
    const valid = {
      amount: '5',
      assetId: 'token-b',
      assetKey,
      destination,
      origin,
      providerId: 'wallet-xcm' as const,
      requireAmount: true,
      reviewedRoutes: [route],
      routeId: route.id,
      tokenBalance: token,
    };

    expect(validateReviewedCrossChainRequest(valid).xcmAssetId).toBe('token-b');
    expect(() => validateReviewedCrossChainRequest({ ...valid, routeId: `${route.id}:forged` })).toThrow(
      'cross_chain_route_id_not_reviewed'
    );
    expect(() => validateReviewedCrossChainRequest({ ...valid, assetId: 'token-a' })).toThrow(
      'cross_chain_origin_asset_mismatch'
    );
    expect(() => validateReviewedCrossChainRequest({ ...valid, amount: '4.999999' })).toThrow(
      'cross_chain_amount_below_reviewed_minimum'
    );
    expect(() => validateReviewedCrossChainRequest({ ...valid, amount: '10.000001' })).toThrow(
      'cross_chain_origin_balance_insufficient'
    );
    expect(() =>
      validateReviewedCrossChainRequest({
        ...valid,
        destination: { ...destination, chainId: 'injected-chain' },
      })
    ).toThrow('cross_chain_route_network_mismatch');
    expect(() => validateReviewedCrossChainRequest({ ...valid, routeId: undefined })).toThrow(
      'cross_chain_reviewed_route_required'
    );
  });
});
