import { networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import type { NetworkJson } from '@extension-base/types';
import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  createReviewedCrossChainRouteId,
  getReviewedRouteProvider,
  type ReviewedCrossChainRouteDefinition,
  type CrossChainRouteProviderId,
} from '@/cross-chain/reviewedRoutes';
import { createAssetKey } from '@/portfolio/assetKey';
import { MAX_MOVES, SORA_CHAIN_ID, createReadinessEvaluator, evaluateReadiness } from '@/portfolio/dashboard/readiness';

const ON = { polkaswap: true, crossChainXcm: true, crossChainSoraBridge: true, crossChainLiberland: true };
const MOVES_OFF = { polkaswap: true, crossChainXcm: false, crossChainSoraBridge: false, crossChainLiberland: false };
const SWAPS_OFF = { ...ON, polkaswap: false };

// --- A small registry of invented chains, to test the walk itself -------------------------------------------------
const asset = (id: string, symbol: string) => ({
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

const network = (name: string, chainId: string, symbol: string, destinations: string[]): NetworkJson =>
  ({
    active: true,
    assets: [asset(`${chainId}-${symbol}`, symbol)],
    chainId,
    ecosystem: 'substrate',
    favorite: [],
    icon: name.toLowerCase(),
    key: name,
    name,
    options: [],
    xcm: {
      availableAssets: [{ id: `x-${symbol}`, interiors: [], symbol, versions: ['v3'] }],
      availableDestinations: destinations.map((chainId) => ({
        assets: [{ id: `x-${symbol}`, interiors: [], symbol, versions: ['v3'] }],
        bridgeParachainId: '',
        chainId,
      })),
      xcmVersion: 'v3',
    },
  }) as unknown as NetworkJson;

// Synthetic graph fixtures deliberately bypass production route-retirement validation.
const graphRoute = (input: Omit<ReviewedCrossChainRouteDefinition, 'id' | 'action'>): Readonly<ReviewedCrossChainRouteDefinition> =>
  Object.freeze({ ...input, id: createReviewedCrossChainRouteId(input), action: getReviewedRouteProvider(input.providerId).action });

const move = (from: string, to: string, symbol: string, providerId: CrossChainRouteProviderId = 'wallet-xcm') =>
  graphRoute({
    providerId,
    originChainId: from,
    destinationChainId: to,
    originEcosystem: 'substrate',
    destinationEcosystem: 'substrate',
    originAssetId: `${from}-${symbol}`,
    assetKeyAssetId: `${from}-${symbol}`,
    originXcmAssetId: `x-${symbol}`,
    destinationXcmAssetId: `x-${symbol}`,
    symbol,
    precision: 6,
    minimum: null,
    execution: {
      kind: 'relay-native-xcm-v3',
      originChainId: from,
      destinationChainId: to,
      assetXcmId: `x-${symbol}`,
      assetPrecision: 6,
      pallet: 'polkadotXcm',
      call: 'limitedReserveTransferAssets',
      callCandidates: [{ pallet: 'polkadotXcm', call: 'limitedReserveTransferAssets', args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'] }],
      destinationFee: '0',
      relayNetwork: 'Polkadot',
      destinationParaId: 2000,
      receiverKind: 'AccountId32',
      assetParents: 0,
      assetInteriors: [],
    },
  });

const KEY = (chainId: string, symbol: string) => createAssetKey({ ecosystem: 'substrate', chainId, assetId: `${chainId}-${symbol}` });
const subject = (chainId: string, symbol: string, networkName: string) => ({ key: KEY(chainId, symbol), networkName, symbol });

describe('readiness: the walk to SORA', () => {
  // Hub -> Mid -> SORA is two moves; Far -> A -> B -> SORA is three; Edge -> E1 -> E2 -> E3 -> SORA is four and too long.
  const networks = [
    network('Hub', 'hub', 'TOK', ['mid', 'cycle']),
    network('Mid', 'mid', 'TOK', [SORA_CHAIN_ID, 'hub']),
    network('Cycle', 'cycle', 'TOK', ['hub']),
    network('Far', 'far', 'TOK', ['a']),
    network('A', 'a', 'TOK', ['b']),
    network('B', 'b', 'TOK', [SORA_CHAIN_ID]),
    network('Edge', 'edge', 'TOK', ['e1']),
    network('E1', 'e1', 'TOK', ['e2']),
    network('E2', 'e2', 'TOK', ['e3']),
    network('E3', 'e3', 'TOK', [SORA_CHAIN_ID]),
    network('Lonely', 'lonely', 'TOK', []),
    network('SORA Mainnet', SORA_CHAIN_ID, 'TOK', []),
  ];
  const reviewedRoutes = [
    move('hub', 'mid', 'TOK'),
    move('hub', 'cycle', 'TOK'),
    move('cycle', 'hub', 'TOK'),
    move('mid', 'hub', 'TOK'),
    move('mid', SORA_CHAIN_ID, 'TOK', 'sora-substrate-bridge'),
    move('far', 'a', 'TOK'),
    move('a', 'b', 'TOK'),
    move('b', SORA_CHAIN_ID, 'TOK', 'sora-substrate-bridge'),
    move('edge', 'e1', 'TOK'),
    move('e1', 'e2', 'TOK'),
    move('e2', 'e3', 'TOK'),
    move('e3', SORA_CHAIN_ID, 'TOK', 'sora-substrate-bridge'),
  ];
  type Actions = Record<string, boolean> | undefined;
  const evaluateWith = (actions: Actions, chainId: string, name: string) =>
    evaluateReadiness(subject(chainId, 'TOK', name), { networks, actions, soraNetworkName: 'SORA Mainnet', reviewedRoutes });
  const evaluate = (chainId: string, name: string, actions: Record<string, boolean> = ON) => evaluateWith(actions, chainId, name);

  it('says ready for a holding on the swap venue, while swaps are on', () => {
    expect(evaluate(SORA_CHAIN_ID, 'SORA Mainnet')).toEqual({ state: 'ready', hops: [] });
    expect(evaluate(SORA_CHAIN_ID, 'sora mainnet').state).toBe('ready');
  });

  it('says off, because of the swaps, for a holding on the venue while swaps are off', () => {
    expect(evaluate(SORA_CHAIN_ID, 'SORA Mainnet', SWAPS_OFF)).toEqual({ state: 'off', hops: [], cause: 'swaps-off' });
  });

  it('counts the moves of a reviewed route, first move first', () => {
    const one = evaluate('mid', 'Mid');
    const two = evaluate('hub', 'Hub');
    const three = evaluate('far', 'Far');

    expect([one.state, one.hops.length]).toEqual(['route', 1]);
    expect([two.state, two.hops.map((hop) => `${hop.originNetwork}>${hop.destinationNetwork}`)]).toEqual(['route', ['Hub>Mid', 'Mid>SORA Mainnet']]);
    expect([three.state, three.hops.length]).toEqual(['route', MAX_MOVES]);
  });

  it('does not offer a route longer than three moves, or one that does not reach SORA', () => {
    expect(evaluate('edge', 'Edge')).toEqual({ state: 'none', hops: [] });
    expect(evaluate('lonely', 'Lonely')).toEqual({ state: 'none', hops: [] });
  });

  it('does not loop through a chain it has already been to', () => {
    // Hub -> Cycle -> Hub is a loop; the walk still finds Hub -> Mid -> SORA and ends.
    expect(evaluate('hub', 'Hub').hops.map(({ destinationNetwork }) => destinationNetwork)).toEqual(['Mid', 'SORA Mainnet']);
  });

  it('says off, with the moves named, while release policy has them switched off', () => {
    const result = evaluate('hub', 'Hub', MOVES_OFF);

    expect(result).toMatchObject({ state: 'off', cause: 'moves-off' });
    expect(result.hops.map(({ enabled }) => enabled)).toEqual([false, false]);
  });

  it('is off when any move of the only route is off, and route once every one is on', () => {
    expect(evaluate('hub', 'Hub', { ...ON, crossChainSoraBridge: false }).state).toBe('off');
    expect(evaluate('hub', 'Hub', ON).state).toBe('route');
  });

  it('claims nothing until release policy has loaded', () => {
    expect(evaluateWith(undefined, 'hub', 'Hub')).toEqual({ state: 'unknown', hops: [] });
    expect(evaluateWith(undefined, SORA_CHAIN_ID, 'SORA Mainnet').state).toBe('unknown');
  });

  it('counts a route only while the live registry still matches it', () => {
    const withoutBridge = networks.filter(({ chainId }) => chainId !== 'mid');

    expect(
      evaluateReadiness(subject('hub', 'TOK', 'Hub'), { networks: withoutBridge, actions: ON, soraNetworkName: 'SORA Mainnet', reviewedRoutes })
    ).toEqual({ state: 'none', hops: [] });
  });

  it('never matches a route to another asset by its symbol alone', () => {
    const other = { key: createAssetKey({ ecosystem: 'substrate', chainId: 'hub', assetId: 'hub-OTHER' }), networkName: 'Hub', symbol: 'TOK' };

    expect(evaluateReadiness(other, { networks, actions: ON, soraNetworkName: 'SORA Mainnet', reviewedRoutes }).state).toBe('none');
  });

  it('gives a key that names nothing no route', () => {
    expect(evaluateReadiness({ key: 'not-a-key', networkName: 'Hub', symbol: 'TOK' }, { networks, actions: ON, soraNetworkName: 'SORA Mainnet', reviewedRoutes }).state).toBe('none');
  });

  it('can be built once and asked about many holdings', () => {
    const ask = createReadinessEvaluator({ networks, actions: ON, soraNetworkName: 'SORA Mainnet', reviewedRoutes });

    expect([ask(subject('mid', 'TOK', 'Mid')).state, ask(subject('hub', 'TOK', 'Hub')).state, ask(subject('lonely', 'TOK', 'Lonely')).state]).toEqual(['route', 'route', 'none']);
  });
});

// --- The routes this build really has, against the reviewed production registry -----------------------------------
describe('readiness: the bundled routes against the registry snapshot', () => {
  const snapshot = readSnapshot();
  const networks = Object.values(networkMap305(snapshot)) as NetworkJson[];
  const byName = (name: string) => networks.find((candidate) => candidate.name === name)!;
  const keyOf = (networkName: string, symbol: string) => {
    const net = byName(networkName);
    const found = net.assets.find((candidate) => candidate.symbol.toUpperCase() === symbol);

    // The key a portfolio row gets: the network's own ecosystem, lowercased (src/portfolio/assetIdentity.ts).
    const ecosystem = String(net.ecosystem).toLowerCase();

    return { key: createAssetKey({ ecosystem, chainId: String(net.chainId), assetId: found!.id }), networkName, symbol };
  };
  const ask = (actions: Record<string, boolean> | undefined) => createReadinessEvaluator({ networks, actions, soraNetworkName: 'SORA Mainnet' });

  it('names SORA the way every route to SORA does', () => {
    BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(({ execution }) => execution && ['external-to-sora-xcm-v3', 'liberland-to-sora-burn'].includes(execution.kind)).forEach((route) =>
      expect(route.destinationChainId).toBe(SORA_CHAIN_ID)
    );
    expect(String(byName('SORA Mainnet').chainId)).toBe(SORA_CHAIN_ID);
  });

  it('puts every asset with an executable reviewed route to SORA one move away', () => {
    const oneMove = (networkName: string, symbol: string) => {
      const result = ask(ON)(keyOf(networkName, symbol));

      return [result.state, result.hops.map(({ originNetwork, destinationNetwork }) => `${originNetwork}>${destinationNetwork}`)];
    };

    expect(oneMove('Polkadot', 'DOT')).toEqual(['none', []]);
    expect(oneMove('Kusama', 'KSM')).toEqual(['none', []]);
    expect(oneMove('Acala', 'ACA')).toEqual(['none', []]);
    expect(oneMove('Astar', 'ASTR')).toEqual(['none', []]);
    expect(oneMove('Liberland', 'LLD')).toEqual(['route', ['Liberland>SORA Mainnet']]);
  });

  it('does not count a move that has no executable authority bundled, such as Asset Hub back to Polkadot', () => {
    // The reverse XCM routes are catalogued without an execution, so they are not offered and DOT on Asset Hub has no route.
    expect(ask(ON)(keyOf('Polkadot AssetHub', 'DOT'))).toEqual({ state: 'none', hops: [] });
  });

  it('says what the 4.2.0 policy says: the moves exist and are paused, swaps are on', () => {
    const asked = ask({ polkaswap: true, crossChainXcm: false, crossChainSoraBridge: false, crossChainLiberland: false });

    expect(asked(keyOf('Liberland', 'LLD'))).toMatchObject({ state: 'off', cause: 'moves-off' });
    expect(asked(keyOf('SORA Mainnet', 'XOR'))).toEqual({ state: 'ready', hops: [] });
  });

  it('names the same asset on SORA, where Receive on SORA points', () => {
    const lld = byName('SORA Mainnet').assets.find(({ symbol }) => symbol.toUpperCase() === 'LLD')!;
    expect(lld).toBeDefined();
    expect(ask(ON)(keyOf('Liberland', 'LLD')).soraAssetId).toBe(lld.id);
  });

  it('has no route for a token that has none, and says so for Ethereum, which the registry keeps unavailable', () => {
    expect(ask(ON)(keyOf('Ethereum', 'ETH'))).toEqual({ state: 'none', hops: [], unavailable: 'ethereum-to-sora' });
    expect(ask(ON)(keyOf('Ethereum', 'USDT'))).toEqual({ state: 'none', hops: [] });
  });
});
