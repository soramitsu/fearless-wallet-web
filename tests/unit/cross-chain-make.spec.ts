import { makeCrossChain } from '@extension-base/api/substrate/crossChain';
import { BasicTxErrorCode, TransferErrorCode } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';
import type { MakeCrossChainProps } from '@extension-base/api/substrate/types';
import type { BasicTxResponse } from '@extension-base/background/types/types';
import type { TrackableResult } from '@/cross-chain/trackedSend';
import {
  CrossChainPreviousSendUnresolvedError,
  CrossChainSendLedger,
  crossChainSendRecordKey,
  type CrossChainSendRecords,
} from '@/cross-chain/sendLedger';

const mocks = vi.hoisted(() => ({
  assertReviewedRuntimeAuthority: vi.fn(),
  createReviewedCrossChainExtrinsic: vi.fn(),
  validateReviewedCrossChainRequest: vi.fn(),
  signExtrinsic: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: mocks.storageGet, set: mocks.storageSet } }));
vi.mock('@extension-base/api/substrate', () => ({
  getPrecisionValue: (amount: string, precision: number) => `${amount}@${precision}`,
}));
vi.mock('@extension-base/api/substrate/shared/signExtrinsic', () => ({ signExtrinsic: mocks.signExtrinsic }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({
  getUtilityProps: () => ({ id: 'polkadot-dot', precision: 10 }),
}));
vi.mock('@/cross-chain/reviewedRuntimeAuthority', () => ({
  assertReviewedRuntimeAuthority: mocks.assertReviewedRuntimeAuthority,
}));
vi.mock('@/cross-chain/reviewedExecution', () => ({
  createReviewedCrossChainExtrinsic: mocks.createReviewedCrossChainExtrinsic,
  createReviewedExecutionFingerprint: () => 'runtime-fingerprint',
  resolveReviewedRuntimeCall: () => ({ descriptor: {} }),
}));
vi.mock('@/cross-chain/originDryRun', () => ({ assertOriginExecutes: async () => undefined }));
vi.mock('@/cross-chain/requestValidation', () => ({
  validateReviewedCrossChainRequest: mocks.validateReviewedCrossChainRequest,
}));
vi.mock('@/cross-chain/quoteFingerprint', () => ({ createCrossChainQuoteFingerprint: () => 'quote-fingerprint' }));

const ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const OTHER = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
const ROUTE = 'reviewed-v1:wallet-xcm:polkadot:asset-hub:polkadot-dot';
const HASH = 'ab'.repeat(32);
const execution = { kind: 'relay-native-xcm-v3', destinationFee: '0.001', assetPrecision: 10 };

const inBlock = (extra: Partial<TrackableResult> = {}): TrackableResult => ({
  status: { type: 'InBlock', isInBlock: true, isFinalized: false, isDropped: false, isInvalid: false, isUsurped: false },
  ...extra,
});

type Send = (callback: (result: TrackableResult) => void) => Promise<() => void>;

const included: Send = async (callback) => {
  callback(inBlock());

  return () => undefined;
};

function memoryLedger() {
  let stored: CrossChainSendRecords | undefined;
  const store = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (records: CrossChainSendRecords) => {
      stored = structuredClone(records);
    }),
  };

  return { ledger: new CrossChainSendLedger(store), store, stored: () => stored };
}

function harness({ send = included, head = 1_000, nonce = 7 }: { send?: Send; head?: number; nonce?: number } = {}) {
  const order: string[] = [];
  const chain = { head, nonce };
  const api = {
    isConnected: true,
    isReady: Promise.resolve(),
    isReadyOrError: Promise.resolve(),
    rpc: { chain: { getHeader: vi.fn(async () => ({ number: { toNumber: () => chain.head } })) } },
    query: { system: { account: vi.fn(async () => ({ nonce: { toNumber: () => chain.nonce } })) } },
  };
  const extrinsic = {
    paymentInfo: vi.fn(async () => ({ partialFee: { toString: () => '100000000' } })),
    era: { isMortalEra: true, asMortalEra: { period: { toNumber: () => 64 } } },
    nonce: { toNumber: () => 7 },
    hash: { toHex: () => `0x${HASH}` },
    registry: { findMetaError: () => ({ section: 'balances', name: 'InsufficientBalance' }) },
    send: vi.fn(async (callback: (result: TrackableResult) => void) => {
      order.push('send');

      return send(callback);
    }),
  };
  const pair = { meta: {} };
  let selected = ADDRESS;
  const unlockPair = vi.fn(() => {
    order.push('unlock');

    return true;
  });
  const state = {
    keyringService: { getSubstrateAddress: (address: string) => address, getPair: () => pair, unlockPair },
    getAccountAddress: () => selected,
    networkService: {
      networkMap: {
        Polkadot: { name: 'Polkadot', chainId: 'polkadot' },
        'Polkadot Asset Hub': { name: 'Polkadot Asset Hub', chainId: 'asset-hub' },
      },
      substrateApiHandler: { initApi: vi.fn() },
    },
    getSubstrateApiMap: { polkadot: { api } },
    balanceService: {
      getTokenBalance: () => ({ balances: [{ name: 'Polkadot', transferable: '100' }] }),
      substrateBalanceService: { fetchBalance: vi.fn(async () => undefined) },
    },
    actionCapabilityService: { isActionEnabled: () => true },
  } as unknown as State;

  mocks.validateReviewedCrossChainRequest.mockImplementation(() => ({
    action: 'crossChainXcm',
    routeId: ROUTE,
    providerId: 'wallet-xcm',
    xcmAssetId: 'dot',
    execution,
    minimum: '0.01',
  }));
  mocks.assertReviewedRuntimeAuthority.mockImplementation(async () => {
    order.push('quote');

    return { originApi: api, runtimeMinimum: '0' };
  });
  mocks.createReviewedCrossChainExtrinsic.mockResolvedValue({ extrinsic, executionFingerprint: 'runtime-fingerprint' });
  mocks.signExtrinsic.mockImplementation(async ({ finalGuard }: { finalGuard?: () => void }) => {
    order.push('guard');
    finalGuard?.();
    order.push('sign');
  });

  const callback = vi.fn((_response: BasicTxResponse) => undefined);
  const props = (overrides: Partial<MakeCrossChainProps> = {}): MakeCrossChainProps =>
    ({
      assetId: 'polkadot-dot',
      assetKey: 'asset-key',
      routeId: ROUTE,
      routeProviderId: 'wallet-xcm',
      xcmAssetId: 'dot',
      execution,
      reviewedMinimum: '0.01',
      originNet: 'Polkadot',
      destinationNet: 'Polkadot Asset Hub',
      to: OTHER,
      from: ADDRESS,
      amount: '1',
      tokenBalance: {},
      callback,
      isMobile: false,
      expectedOriginFee: '0.01',
      expectedDestinationFee: '0.001',
      expectedExecutionFingerprint: 'quote-fingerprint',
      capturedPair: pair,
      ...overrides,
    }) as unknown as MakeCrossChainProps;

  return {
    api,
    callback,
    chain,
    extrinsic,
    order,
    props,
    selectAccount: (address: string) => {
      selected = address;
    },
    state,
    unlockPair,
  };
}

describe('makeCrossChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageGet.mockResolvedValue({});
    mocks.storageSet.mockResolvedValue(undefined);
  });

  it('signs after every guard, records the send before it leaves, and reports inclusion with the hash', async () => {
    const { ledger, store, stored } = memoryLedger();
    const h = harness();
    const save = store.save.getMockImplementation()!;
    store.save.mockImplementation(async (records: CrossChainSendRecords) => {
      h.order.push(Object.keys(records).length ? 'record' : 'clear');
      await save(records);
    });

    const response = await makeCrossChain(h.props(), h.state, ledger);

    expect(response).toEqual({ status: true, transactionHash: HASH });
    expect(h.callback).toHaveBeenCalledExactlyOnceWith(response);
    expect(h.order).toEqual(['quote', 'unlock', 'quote', 'guard', 'sign', 'record', 'send', 'clear']);
    expect(stored()).toEqual({});
  });

  it('records the nonce, hash and mortality of the signed extrinsic', async () => {
    const { ledger, store } = memoryLedger();
    const h = harness({ send: async () => new Promise<() => void>(() => undefined) });
    vi.useFakeTimers();

    const pending = makeCrossChain(h.props(), h.state, ledger);
    await vi.waitFor(() => expect(store.save).toHaveBeenCalled());

    expect(store.save.mock.calls[0][0][crossChainSendRecordKey(ADDRESS, ROUTE)]).toMatchObject({
      address: ADDRESS,
      routeId: ROUTE,
      originNet: 'Polkadot',
      nonce: 7,
      hash: HASH,
      expiresAtBlock: 1_064,
    });

    await vi.advanceTimersByTimeAsync(180_000);
    await expect(pending).resolves.toMatchObject({ outcome: 'unknown', transactionHash: HASH });
    vi.useRealTimers();
  });

  it('blocks the same route after an unknown outcome until the chain resolves it', async () => {
    const { ledger, stored } = memoryLedger();
    const h = harness({
      send: async () => {
        throw new Error('WebSocket is not connected');
      },
    });

    const first = await makeCrossChain(h.props(), h.state, ledger);
    expect(first).toEqual({
      status: false,
      outcome: 'unknown',
      transactionHash: HASH,
      errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: 'WebSocket is not connected' }],
    });
    expect(h.callback).toHaveBeenLastCalledWith(first);
    expect(stored()?.[crossChainSendRecordKey(ADDRESS, ROUTE)]?.hash).toBe(HASH);

    // Still includable: refused before quoting or signing again.
    mocks.signExtrinsic.mockClear();
    mocks.assertReviewedRuntimeAuthority.mockClear();
    const refused = makeCrossChain(h.props(), h.state, ledger);
    await expect(refused).rejects.toBeInstanceOf(CrossChainPreviousSendUnresolvedError);
    await expect(refused).rejects.toMatchObject({ transactionHash: HASH });
    expect(mocks.assertReviewedRuntimeAuthority).not.toHaveBeenCalled();
    expect(mocks.signExtrinsic).not.toHaveBeenCalled();

    // The nonce was used: reported once with the hash, then forgotten.
    h.chain.nonce = 8;
    await expect(makeCrossChain(h.props(), h.state, ledger)).rejects.toMatchObject({ transactionHash: HASH });
    expect(stored()).toEqual({});

    h.extrinsic.send.mockImplementation(included);
    await expect(makeCrossChain(h.props(), h.state, ledger)).resolves.toEqual({ status: true, transactionHash: HASH });
  });

  it('allows the route again once the unknown send expired without using its nonce', async () => {
    const { ledger } = memoryLedger();
    const h = harness({
      send: async () => {
        throw new Error('No response received from RPC endpoint in 60s');
      },
    });
    await makeCrossChain(h.props(), h.state, ledger);

    h.chain.head = 1_064;
    h.extrinsic.send.mockImplementation(included);

    await expect(makeCrossChain(h.props(), h.state, ledger)).resolves.toEqual({ status: true, transactionHash: HASH });
  });

  it('runs one send per account at a time', async () => {
    const { ledger } = memoryLedger();
    const h = harness();
    let release!: () => void;
    mocks.signExtrinsic.mockImplementationOnce(
      ({ finalGuard }: { finalGuard?: () => void }) =>
        new Promise<void>((resolve) => {
          finalGuard?.();
          release = resolve;
        })
    );

    const first = makeCrossChain(h.props(), h.state, ledger);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));

    await expect(makeCrossChain(h.props(), h.state, ledger)).rejects.toThrow('cross_chain_send_in_progress');
    expect(mocks.signExtrinsic).toHaveBeenCalledOnce();

    release();
    await expect(first).resolves.toMatchObject({ status: true });
    await expect(makeCrossChain(h.props(), h.state, ledger)).resolves.toMatchObject({ status: true });
  });

  it('does not send when the record cannot be written', async () => {
    const { ledger, store } = memoryLedger();
    store.save.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const h = harness();

    await expect(makeCrossChain(h.props(), h.state, ledger)).rejects.toThrow('QuotaExceededError');
    expect(h.extrinsic.send).not.toHaveBeenCalled();
  });

  it('does not sign when the fee changed after the user confirmed it', async () => {
    const { ledger } = memoryLedger();
    const h = harness();

    await expect(makeCrossChain(h.props({ expectedOriginFee: '0.009' }), h.state, ledger)).rejects.toThrow(
      'cross_chain_fee_changed'
    );
    expect(h.unlockPair).not.toHaveBeenCalled();
    expect(mocks.signExtrinsic).not.toHaveBeenCalled();
  });

  it('stops at the signing boundary when the selected account changed', async () => {
    const { ledger } = memoryLedger();
    const h = harness();
    mocks.signExtrinsic.mockImplementationOnce(async ({ finalGuard }: { finalGuard?: () => void }) => {
      h.selectAccount(OTHER);
      (h.state.keyringService as unknown as { getPair: (address: string) => unknown }).getPair = (address: string) =>
        address === OTHER ? { meta: {} } : h.props().capturedPair;
      finalGuard?.();
    });

    await expect(makeCrossChain(h.props(), h.state, ledger)).rejects.toThrow('cross_chain_selected_account_changed');
    expect(h.extrinsic.send).not.toHaveBeenCalled();
  });

  it('reports a dispatch failure with the hash and forgets the record', async () => {
    const { ledger, stored } = memoryLedger();
    const h = harness({
      send: async (callback) => {
        callback(
          inBlock({ dispatchError: { isModule: true, asModule: { index: 10, error: 2 }, toString: () => 'module' } })
        );

        return () => undefined;
      },
    });

    await expect(makeCrossChain(h.props(), h.state, ledger)).resolves.toEqual({
      status: false,
      transactionHash: HASH,
      errors: [{ code: TransferErrorCode.CROSSCHAIN_ERROR, message: 'balances.InsufficientBalance' }],
    });
    expect(stored()).toEqual({});
  });

  it('reports a pool rejection for fees as a low balance, without a hash to look up', async () => {
    const { ledger } = memoryLedger();
    const message = '1010: Invalid Transaction: Inability to pay some fees , e.g. account balance too low';
    const h = harness({
      send: async () => {
        throw Object.assign(new Error(message), { code: 1010 });
      },
    });

    await expect(makeCrossChain(h.props(), h.state, ledger)).resolves.toEqual({
      status: false,
      errors: [{ code: BasicTxErrorCode.BALANCE_TO_LOW, message }],
    });
  });

  it('keeps unresolved sends in wallet storage by default', async () => {
    const h = harness({
      send: async () => {
        throw new Error('WebSocket is not connected');
      },
    });

    await makeCrossChain(h.props(), h.state);

    expect(mocks.storageSet).toHaveBeenCalledWith({
      crossChainSendsInDoubt: { [crossChainSendRecordKey(ADDRESS, ROUTE)]: expect.objectContaining({ hash: HASH }) },
    });
  });
});
