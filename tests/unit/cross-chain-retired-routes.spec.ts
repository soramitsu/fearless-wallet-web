import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  BUNDLED_REVIEWED_ROUTE_ERRORS,
  RETIRED_CROSS_CHAIN_CHAINS,
  buildBundledReviewedRoutes,
  defineReviewedCrossChainRoute,
  relayExecutionSharesRelay,
  retiredCrossChainRouteReason,
  type ReviewedCrossChainRouteDefinition,
} from '@/cross-chain/reviewedRoutes';

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';
const POLKADOT_ASSET_HUB = '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f';
const KUSAMA_ASSET_HUB = '48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a';
const MOONBEAM = 'fe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d';
const MOONRIVER = '401a1f9dca3da46f5c4091016c8a2f26dcea05865116b286f60f668207d1474b';
const PARALLEL = 'e61a41c53f5dcd0beb09df93b34402aada44cb05117b71059cce40a2723a4e97';
const ACALA = 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c';
const KARURA = 'baf5aabe40646d11f0ee8abbdc64f4a4b7674925cba08e4a05ff9ebed6e2126b';
const SORA = '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5';
const ASTAR = '9eb76c5184c4ab8679d2d5d819fdf90b9c001403e9e17da2e14b6d8aec4029c6';
const LIBERLAND = '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6';

const touching = (chainId: string) =>
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(
    ({ originChainId, destinationChainId }) => originChainId === chainId || destinationChainId === chainId
  );

const relayTeleportInput = (originChainId: string, destinationChainId: string, symbol: 'DOT' | 'KSM') => ({
  originChainId,
  destinationChainId,
  symbol,
  execution: {
    kind: 'relay-native-xcm-v3' as const,
    originChainId,
    destinationChainId,
    assetXcmId: 'asset',
    assetPrecision: 10,
    pallet: 'xcmPallet' as const,
    call: 'limitedTeleportAssets' as const,
    callCandidates: [],
    destinationFee: '0',
    relayNetwork: 'Polkadot' as const,
    destinationParaId: 1000,
    receiverKind: 'AccountId32' as const,
    assetParents: 0 as const,
    assetInteriors: [],
  },
});

describe('retired cross-chain routes', () => {
  it('lists exactly the chains whose parachains are no longer registered', () => {
    expect(Object.keys(RETIRED_CROSS_CHAIN_CHAINS).sort()).toEqual([MOONBEAM, MOONRIVER, PARALLEL].sort());
  });

  it('ships no reviewed route to or from a retired chain', () => {
    [MOONBEAM, MOONRIVER, PARALLEL].forEach((chainId) => expect(touching(chainId)).toEqual([]));
  });

  it('keeps only relay ↔ Asset Hub teleports for DOT and KSM', () => {
    const relayRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(
      ({ originChainId, destinationChainId, symbol }) =>
        (symbol === 'DOT' || symbol === 'KSM') &&
        [POLKADOT, KUSAMA].some((relay) => relay === originChainId || relay === destinationChainId)
    );

    expect(relayRoutes.map(({ originChainId, destinationChainId, symbol }) => [originChainId, destinationChainId, symbol])).toEqual([
      [POLKADOT, POLKADOT_ASSET_HUB, 'DOT'],
      [KUSAMA, KUSAMA_ASSET_HUB, 'KSM'],
    ]);
    relayRoutes.forEach(({ execution }) => {
      expect(execution?.kind).toBe('relay-native-xcm-v3');
      expect(execution && 'call' in execution ? execution.call : undefined).toBe('limitedTeleportAssets');
      expect(execution?.callCandidates.map(({ pallet, call }) => `${pallet}.${call}`)).toEqual([
        'xcmPallet.limitedTeleportAssets',
      ]);
    });
  });

  it('gives each relay teleport a reviewed floor, a destination fee and a live destination minimum', () => {
    const teleport = (symbol: 'DOT' | 'KSM') =>
      BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.find((route) => route.providerId === 'wallet-xcm' && route.symbol === symbol)!;

    // Asset Hub deducts its fee from the amount and traps anything that lands below its existential deposit, so a
    // teleport without a floor loses small amounts (0.005 DOT and 0.0108 DOT both fail on the live runtime).
    expect(teleport('DOT').minimum).toBe('0.02');
    expect(teleport('DOT').execution).toMatchObject({
      destinationFee: '0.001',
      destinationMinimum: { kind: 'balances-existential-deposit', precision: 10 },
    });
    expect(teleport('KSM').minimum).toBe('0.0002');
    expect(teleport('KSM').execution).toMatchObject({
      destinationFee: '0.0001',
      destinationMinimum: { kind: 'balances-existential-deposit', precision: 12 },
    });
  });

  it('does not bridge DOT or KSM through a relay chain any more', () => {
    const soraRelayLegs = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(
      ({ providerId, symbol }) => providerId === 'sora-substrate-bridge' && (symbol === 'DOT' || symbol === 'KSM')
    );

    expect(soraRelayLegs).toEqual([]);
  });

  it('keeps only the bridge routes that still deliver: Liberland to SORA', () => {
    const bridgeRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(({ providerId }) => providerId !== 'wallet-xcm')
      .map(({ originChainId, destinationChainId, symbol }) => `${originChainId}>${destinationChainId}:${symbol}`)
      .sort();

    expect(bridgeRoutes).toEqual(
      [`${LIBERLAND}>${SORA}:LLD`, `${LIBERLAND}>${SORA}:LLM`, `${LIBERLAND}>${SORA}:XOR`].sort()
    );
  });

  it('refuses to define a route into a retired chain', () => {
    [MOONBEAM, MOONRIVER, PARALLEL].forEach((chainId) => {
      expect(retiredCrossChainRouteReason({ ...relayTeleportInput(POLKADOT, chainId, 'DOT') })).toMatch(/registered/);
      expect(retiredCrossChainRouteReason({ ...relayTeleportInput(chainId, POLKADOT, 'DOT') })).toMatch(/registered/);
    });

    expect(() =>
      defineReviewedCrossChainRoute({
        providerId: 'wallet-xcm',
        originChainId: POLKADOT,
        destinationChainId: MOONBEAM,
        originEcosystem: 'substrate',
        destinationEcosystem: 'evm',
        originAssetId: 'dot',
        assetKeyAssetId: 'dot',
        originXcmAssetId: 'dot',
        destinationXcmAssetId: 'dot',
        symbol: 'DOT',
        precision: 10,
        minimum: null,
      } as Parameters<typeof defineReviewedCrossChainRoute>[0])
    ).toThrow('cross_chain_route_retired');
  });

  it('retires DOT and KSM reserve transfers and bridges that touch a relay chain', () => {
    const reserveFromRelay = {
      ...relayTeleportInput(POLKADOT, ACALA, 'DOT'),
      execution: { ...relayTeleportInput(POLKADOT, ACALA, 'DOT').execution, call: 'limitedReserveTransferAssets' as const },
    };

    expect(retiredCrossChainRouteReason(reserveFromRelay)).toMatch(/Asset Hub Migration/);
    expect(retiredCrossChainRouteReason({ originChainId: ACALA, destinationChainId: POLKADOT, symbol: 'DOT' })).toMatch(
      /Asset Hub Migration/
    );
    expect(retiredCrossChainRouteReason({ originChainId: SORA, destinationChainId: KUSAMA, symbol: 'KSM' })).toMatch(
      /SORA parachains/
    );
    expect(retiredCrossChainRouteReason({ originChainId: KARURA, destinationChainId: KUSAMA, symbol: 'KSM' })).toMatch(
      /Asset Hub Migration/
    );
  });

  it('allows only the matching relay → Asset Hub teleport pairs', () => {
    expect(retiredCrossChainRouteReason(relayTeleportInput(POLKADOT, POLKADOT_ASSET_HUB, 'DOT'))).toBeUndefined();
    expect(retiredCrossChainRouteReason(relayTeleportInput(KUSAMA, KUSAMA_ASSET_HUB, 'KSM'))).toBeUndefined();
    // A teleport shape toward the wrong relay's Asset Hub, or back toward the relay, is not a reviewed pair.
    expect(retiredCrossChainRouteReason(relayTeleportInput(POLKADOT, KUSAMA_ASSET_HUB, 'DOT'))).toBeDefined();
    expect(retiredCrossChainRouteReason(relayTeleportInput(POLKADOT_ASSET_HUB, POLKADOT, 'DOT'))).toBeDefined();
  });

  it('retires every SORA route except Liberland to SORA', () => {
    // The SORA parachains for Polkadot and Kusama stopped producing blocks (2025-12-13 and 2025-11-11), so nothing
    // sent through them can be credited, in either direction and whatever the counterpart chain.
    [ACALA, ASTAR, POLKADOT, KUSAMA, POLKADOT_ASSET_HUB, KUSAMA_ASSET_HUB, KARURA].forEach((chainId) => {
      expect(retiredCrossChainRouteReason({ originChainId: chainId, destinationChainId: SORA, symbol: 'X' })).toMatch(
        /SORA parachains/
      );
      expect(retiredCrossChainRouteReason({ originChainId: SORA, destinationChainId: chainId, symbol: 'X' })).toMatch(
        /SORA parachains/
      );
    });
  });

  it('retires SORA to Liberland while its transfers stay pending, and keeps Liberland to SORA', () => {
    expect(retiredCrossChainRouteReason({ originChainId: SORA, destinationChainId: LIBERLAND, symbol: 'LLD' })).toMatch(
      /Liberland/
    );
    expect(
      retiredCrossChainRouteReason({ originChainId: LIBERLAND, destinationChainId: SORA, symbol: 'LLD' })
    ).toBeUndefined();
  });

  it('does not touch routes that never involve a relay chain, SORA or a retired chain', () => {
    expect(
      retiredCrossChainRouteReason({ originChainId: ACALA, destinationChainId: ASTAR, symbol: 'ACA' })
    ).toBeUndefined();
  });

  it('keeps every bundled route id unique and executable', () => {
    const ids = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.forEach((route: Readonly<ReviewedCrossChainRouteDefinition>) =>
      expect(route.execution, route.id).toBeDefined()
    );
  });
});

describe('bundled route table integrity', () => {
  it('builds every bundled definition without a problem', () => {
    expect(BUNDLED_REVIEWED_ROUTE_ERRORS).toEqual([]);
  });

  it('bundles relay executions only toward a parachain of the same relay', () => {
    const relayExecutions = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.flatMap(({ execution }) =>
      execution?.kind === 'relay-native-xcm-v3' ? [execution] : []
    );

    expect(relayExecutions).toHaveLength(2);
    relayExecutions.forEach((execution) => expect(relayExecutionSharesRelay(execution)).toBe(true));
  });

  it.each([
    ['Polkadot to Polkadot Asset Hub', 'Polkadot', POLKADOT, POLKADOT_ASSET_HUB, true],
    ['Kusama to Kusama Asset Hub', 'Kusama', KUSAMA, KUSAMA_ASSET_HUB, true],
    ['Polkadot to the Kusama Asset Hub para id', 'Polkadot', POLKADOT, KUSAMA_ASSET_HUB, false],
    ['Kusama to Acala, which shares a para id with Karura', 'Kusama', KUSAMA, ACALA, false],
    ['a parachain origin', 'Polkadot', POLKADOT_ASSET_HUB, ACALA, false],
    ['an unknown destination', 'Polkadot', POLKADOT, LIBERLAND, false],
  ] as const)('decides whether %s shares a relay', (_label, relayNetwork, originChainId, destinationChainId, shared) => {
    expect(relayExecutionSharesRelay({ relayNetwork, originChainId, destinationChainId })).toBe(shared);
  });

  it('leaves out a definition that throws or a duplicated id instead of failing at import', () => {
    const route = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES[0];
    const other = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES[1];
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const built = buildBundledReviewedRoutes([
      () => route,
      () => {
        throw new Error('cross_chain_execution_definition_mismatch');
      },
      () => other,
      () => other,
    ]);

    expect(built.routes).toEqual([route]);
    expect(built.errors).toEqual([
      'route definition 1: cross_chain_execution_definition_mismatch',
      `route ${other.id}: duplicate id`,
    ]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
