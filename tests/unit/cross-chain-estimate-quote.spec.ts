import { estimateCrossChainQuote } from '@extension-base/api/substrate/crossChain';
import type State from '@extension-base/background/handlers/State';
import type { CrossChainProps } from '@extension-base/api/substrate/types';
import { FPNumber } from '@/sora/number';

const mocks = vi.hoisted(() => ({
  assertReviewedRuntimeAuthority: vi.fn(),
  createReviewedCrossChainExtrinsic: vi.fn(),
  assertOriginExecutes: vi.fn(),
}));

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(async () => ({})), set: vi.fn() } }));
vi.mock('@extension-base/api/substrate', async () => {
  const { FPNumber: Fixed } = await import('@/sora/number');

  return { getPrecisionValue: (amount: string, precision: number) => new Fixed(amount, precision).toCodecString() };
});
vi.mock('@extension-base/api/substrate/shared/signExtrinsic', () => ({ signExtrinsic: vi.fn() }));
vi.mock('@/cross-chain/reviewedRuntimeAuthority', () => ({
  assertReviewedRuntimeAuthority: mocks.assertReviewedRuntimeAuthority,
}));
vi.mock('@/cross-chain/reviewedExecution', () => ({
  createReviewedCrossChainExtrinsic: mocks.createReviewedCrossChainExtrinsic,
  createReviewedExecutionFingerprint: () => 'runtime-fingerprint',
  resolveReviewedRuntimeCall: () => ({ descriptor: {} }),
}));
vi.mock('@/cross-chain/originDryRun', () => ({ assertOriginExecutes: mocks.assertOriginExecutes }));

const ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const RECIPIENT = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const ASSET_HUB = '68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f';
const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const execution = { kind: 'relay-native-xcm-v3', originChainId: POLKADOT, destinationFee: '0.001', assetPrecision: 10 };
const dotRow = { id: DOT, symbol: 'dot', precision: 10 };

function setup({ partialFee = '183000000', runtimeMinimum = '0' }: { partialFee?: string; runtimeMinimum?: string } = {}) {
  const order: string[] = [];
  const originApi = { tag: 'origin-api' };
  const extrinsic = {
    paymentInfo: vi.fn(async () => {
      order.push('price');

      return { partialFee: { toString: () => partialFee } };
    }),
  };
  mocks.assertReviewedRuntimeAuthority.mockImplementation(async () => {
    order.push('authority');

    return { originApi, runtimeMinimum };
  });
  mocks.createReviewedCrossChainExtrinsic.mockImplementation(async () => {
    order.push('build');

    return { extrinsic, executionFingerprint: 'runtime-fingerprint' };
  });
  mocks.assertOriginExecutes.mockImplementation(async () => {
    order.push('dry-run');
  });
  const state = {
    keyringService: { getSubstrateAddress: (address: string) => address },
    networkService: {
      networkMap: {
        Polkadot: { name: 'Polkadot', chainId: POLKADOT, assets: [dotRow] },
        'Polkadot Asset Hub': { name: 'Polkadot Asset Hub', chainId: ASSET_HUB, assets: [dotRow] },
      },
    },
  } as unknown as State;
  const props = (overrides: Partial<CrossChainProps> = {}): CrossChainProps =>
    ({
      assetId: DOT,
      assetKey: 'asset-key',
      routeId: 'reviewed-route',
      routeProviderId: 'wallet-xcm',
      xcmAssetId: 'dot',
      execution,
      reviewedMinimum: '0.02',
      originNet: 'Polkadot',
      destinationNet: 'Polkadot Asset Hub',
      to: RECIPIENT,
      from: ADDRESS,
      amount: '1.5',
      tokenBalance: {},
      ...overrides,
    }) as unknown as CrossChainProps;

  return { extrinsic, order, originApi, props, state };
}

describe('estimateCrossChainQuote', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds the reviewed call for the exact amount, dry-runs it, then prices it', async () => {
    const { extrinsic, order, originApi, props, state } = setup();

    const quote = await estimateCrossChainQuote(props(), state);

    expect(order).toEqual(['authority', 'build', 'dry-run', 'price']);
    expect(mocks.createReviewedCrossChainExtrinsic).toHaveBeenCalledWith({
      execution,
      originChainId: POLKADOT,
      destinationChainId: ASSET_HUB,
      xcmAssetId: 'dot',
      to: RECIPIENT,
      precisionAmount: '15000000000',
      api: originApi,
    });
    expect(mocks.assertOriginExecutes).toHaveBeenCalledWith(execution, originApi, extrinsic, ADDRESS);
    expect(extrinsic.paymentInfo).toHaveBeenCalledWith(ADDRESS);
    expect(quote.originFee.toString()).toBe('0.0183');
    expect(quote.destinationFee.toString()).toBe('0.001');
    expect(quote.minimum.toString()).toBe('0.02');
    expect(quote.runtimeFingerprint).toBe('runtime-fingerprint');
    expect(quote.executionFingerprint).toMatch(/^0x[0-9a-f]{64}$/);
    expect(quote.extrinsic).toBe(extrinsic);
  });

  it('uses the larger of the reviewed and the live minimum and refuses an amount below it', async () => {
    const { props, state } = setup({ runtimeMinimum: '2' });

    await expect(estimateCrossChainQuote(props({ amount: '1.5' }), state)).rejects.toThrow(
      'cross_chain_amount_below_runtime_minimum'
    );
    await expect(estimateCrossChainQuote(props({ amount: '2' }), state)).resolves.toMatchObject({
      minimum: new FPNumber('2'),
    });
  });

  it('binds the quote fingerprint to the recipient, the amount, the sender and the route', async () => {
    const { props, state } = setup();
    const fingerprint = async (overrides: Partial<CrossChainProps> = {}) =>
      (await estimateCrossChainQuote(props(overrides), state)).executionFingerprint;
    const base = await fingerprint();

    expect(await fingerprint()).toBe(base);
    expect(await fingerprint({ to: ADDRESS })).not.toBe(base);
    expect(await fingerprint({ amount: '1.6' })).not.toBe(base);
    expect(await fingerprint({ from: RECIPIENT })).not.toBe(base);
    expect(await fingerprint({ routeId: 'another-route' })).not.toBe(base);
  });

  it('never prices a call whose dry run fails', async () => {
    const { extrinsic, props, state } = setup();
    mocks.assertOriginExecutes.mockRejectedValueOnce(new Error('cross_chain_origin_dry_run_failed'));

    await expect(estimateCrossChainQuote(props(), state)).rejects.toThrow('cross_chain_origin_dry_run_failed');
    expect(extrinsic.paymentInfo).not.toHaveBeenCalled();
  });

  it('fails closed when the runtime builds no call', async () => {
    const { props, state } = setup();
    mocks.createReviewedCrossChainExtrinsic.mockResolvedValueOnce({ extrinsic: null, executionFingerprint: '' });

    await expect(estimateCrossChainQuote(props(), state)).rejects.toThrow('cross_chain_runtime_execution_drift');
    expect(mocks.assertOriginExecutes).not.toHaveBeenCalled();
  });

  it.each([
    ['a registry whose first asset is another one', [{ id: 'polkadot-usdt', symbol: 'USDT', precision: 6 }, dotRow]],
    ['a registry with another fee precision', [{ ...dotRow, precision: 12 }]],
    ['a registry with another fee ticker', [{ ...dotRow, symbol: 'PDOT' }]],
    ['a registry row without assets', []],
  ])('refuses %s before pricing, instead of converting the fee with it', async (_label, assets) => {
    const { extrinsic, props, state } = setup();
    state.networkService.networkMap.Polkadot.assets = assets as never;

    await expect(estimateCrossChainQuote(props(), state)).rejects.toThrow('cross_chain_fee_asset_unavailable');
    expect(extrinsic.paymentInfo).not.toHaveBeenCalled();
  });

  it('refuses a registry row that belongs to another chain', async () => {
    const { props, state } = setup();
    state.networkService.networkMap.Polkadot.chainId = 'another-genesis';

    await expect(estimateCrossChainQuote(props(), state)).rejects.toThrow('cross_chain_fee_asset_unavailable');
  });

  it('refuses a fee it cannot read', async () => {
    const { props, state } = setup({ partialFee: 'not-a-number' });

    await expect(estimateCrossChainQuote(props(), state)).rejects.toThrow('cross_chain_fee_unavailable');
  });

  it.each([
    ['origin', { originNet: 'Unknown' }],
    ['destination', { destinationNet: 'Unknown' }],
  ])('refuses an unknown %s network before reading any runtime', async (_label, overrides) => {
    const { props, state } = setup();

    await expect(estimateCrossChainQuote(props(overrides as Partial<CrossChainProps>), state)).rejects.toThrow(
      'cross_chain_network_unavailable'
    );
    expect(mocks.assertReviewedRuntimeAuthority).not.toHaveBeenCalled();
  });
});
