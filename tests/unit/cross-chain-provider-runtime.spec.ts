import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type State from '@extension-base/background/handlers/State';
import { createCrossChainQuoteFingerprint } from '@/cross-chain/quoteFingerprint';
import {
  createReviewedCrossChainExtrinsic,
  resolveReviewedRuntimeCall,
  type ReviewedExecutionApi,
} from '@/cross-chain/reviewedExecution';
import { assertReviewedRuntimeAuthority, type BridgeRuntimeApi } from '@/cross-chain/reviewedRuntimeAuthority';
import {
  BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES,
  type ReviewedCrossChainExecution,
  type ReviewedRuntimeCall,
} from '@/cross-chain/reviewedRoutes';
import { VALID_SUBSTRATE_ADDRESS } from '@/consts/networks';

const runtimeMethod = (descriptor: ReviewedRuntimeCall) =>
  Object.assign(
    vi.fn(() => ({ paymentInfo: vi.fn() })),
    {
      meta: {
        args: descriptor.args.map((name) => ({ name: { toString: () => name } })),
      },
    }
  );

const executionRuntime = (execution: Readonly<ReviewedCrossChainExecution>) => {
  const method = runtimeMethod(execution.callCandidates[0]);
  const descriptor = execution.callCandidates[0];
  const api = {
    createType: vi.fn((_type: string, value: unknown) => ({ toHex: () => `hex:${String(value)}` })),
    genesisHash: { toHex: () => `0x${execution.originChainId}` },
    isReadyOrError: Promise.resolve(),
    runtimeVersion: {
      specName: { toString: () => 'reviewed-runtime' },
      specVersion: { toString: () => '1' },
    },
    tx: { [descriptor.pallet]: { [descriptor.call]: method } },
  } satisfies ReviewedExecutionApi;

  return { api, method };
};

const bundledExecution = (
  predicate: (execution: Readonly<ReviewedCrossChainExecution>) => boolean
): Readonly<ReviewedCrossChainExecution> => {
  const execution = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map(({ execution }) => execution).find(
    (candidate): candidate is Readonly<ReviewedCrossChainExecution> => Boolean(candidate && predicate(candidate))
  );

  if (!execution) throw new Error('Missing bundled execution fixture');

  return execution;
};

const codec = (value: string | number, json: unknown = value) => ({
  isSome: true,
  toHex: () => String(value),
  toJSON: () => json,
  toNumber: () => Number(value),
  toString: () => String(value),
  unwrap() {
    return this;
  },
});

const authorityApi = (
  chainId: string,
  query: BridgeRuntimeApi['query'] = {},
  consts: BridgeRuntimeApi['consts'] = {}
): BridgeRuntimeApi => ({
  consts,
  createType: vi.fn((_type: string, value: unknown) => ({ toHex: () => String(value) })),
  genesisHash: { toHex: () => `0x${chainId}` },
  isConnected: true,
  isReadyOrError: Promise.resolve(),
  query,
  tx: {},
});

const authorityState = (entries: Array<{ chainId: string; name: string; api: BridgeRuntimeApi }>) =>
  ({
    getSubstrateApiMap: Object.fromEntries(entries.map(({ name, api }) => [name.toLowerCase(), { api }])),
    networkService: {
      networkValues: entries.map(({ chainId, name }) => ({ chainId, name })),
      substrateApiHandler: { initApi: vi.fn() },
    },
  }) as unknown as State;

describe('reviewed cross-chain providers and runtime authority', () => {
  it('matches every executable descriptor to the current audited metadata fixture', () => {
    const fixture = JSON.parse(
      readFileSync(resolve(__dirname, '../fixtures/contracts/cross-chain-runtime-calls-v1.json'), 'utf8')
    ) as {
      runtimes: Array<{
        chainId: string;
        calls: Array<{ pallet: string; call: string; args: string[]; status?: string }>;
      }>;
    };
    const runtimes = new Map(fixture.runtimes.map((runtime) => [runtime.chainId, runtime]));
    const executions = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.flatMap(({ execution }) => (execution ? [execution] : []));

    executions.forEach((execution) => {
      const runtime = runtimes.get(execution.originChainId);
      expect(runtime, execution.originChainId).toBeDefined();
      execution.callCandidates.forEach((candidate) => {
        expect(runtime?.calls).toContainEqual({
          pallet: candidate.pallet,
          call: candidate.call,
          args: [...candidate.args],
        });
      });
    });

    expect(
      runtimes
        .get('7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5')
        ?.calls.find(({ call }) => call === 'transferToSidechain')?.status
    ).toBe('blocked-multi-transaction-claim');
  });

  it('ships complete provider-specific execution authority for every bundled bridge route', () => {
    const bridgeRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(({ providerId }) => providerId !== 'wallet-xcm');

    expect(bridgeRoutes.length).toBeGreaterThan(0);
    expect(bridgeRoutes.every(({ execution }) => Boolean(execution))).toBe(true);
    expect(new Set(bridgeRoutes.map(({ execution }) => execution?.kind))).toEqual(
      new Set(['external-to-sora-xcm-v3', 'sora-bridge-proxy-burn-v3', 'liberland-to-sora-burn'])
    );
  });

  it('negotiates only an exact allowlisted pallet, call, and metadata argument signature', () => {
    const execution = bundledExecution(({ kind }) => kind === 'relay-native-xcm-v3');
    const current = execution.callCandidates[0];
    const currentMethod = runtimeMethod(current);
    const driftedFallback = Object.assign(vi.fn(), {
      meta: {
        args: [...current.args.slice(0, -1), 'injectedWeight'].map((name) => ({
          name: { toString: () => name },
        })),
      },
    });
    const api = {
      createType: vi.fn(),
      isReadyOrError: Promise.resolve(),
      tx: {
        [current.pallet]: { [current.call]: currentMethod },
        polkadotXcm: { [current.call]: driftedFallback },
      },
    } satisfies ReviewedExecutionApi;

    expect(resolveReviewedRuntimeCall(execution, api).method).toBe(currentMethod);

    api.tx[current.pallet][current.call] = driftedFallback;
    expect(() => resolveReviewedRuntimeCall(execution, api)).toThrow('cross_chain_runtime_execution_drift');
  });

  it('constructs SORA and Liberland burns only from their reviewed descriptors', async () => {
    const sora = bundledExecution(
      (execution) => execution.kind === 'sora-bridge-proxy-burn-v3' && execution.bridgeNetwork === 'Liberland'
    );
    const liberland = bundledExecution(
      (execution) => execution.kind === 'liberland-to-sora-burn' && execution.externalAsset === 1
    );

    for (const execution of [sora, liberland]) {
      const { api, method } = executionRuntime(execution);
      await createReviewedCrossChainExtrinsic({
        api,
        destinationChainId: execution.destinationChainId,
        execution,
        originChainId: execution.originChainId,
        precisionAmount: '123',
        to: VALID_SUBSTRATE_ADDRESS,
        xcmAssetId: execution.assetXcmId,
      });

      expect(method).toHaveBeenCalledOnce();
      const [call] = method.mock.calls as unknown as unknown[][];
      expect(call).toHaveLength(4);
      if (execution.kind === 'sora-bridge-proxy-burn-v3') {
        expect(call[0]).toEqual({ Sub: 'Liberland' });
        expect(call[1]).toBe(execution.soraAssetId);
        expect(call[2]).toEqual({ Liberland: `hex:${VALID_SUBSTRATE_ADDRESS}` });
      } else {
        expect(call).toEqual(['Mainnet', { Asset: 1 }, { Sora: VALID_SUBSTRATE_ADDRESS }, '123']);
      }
    }
  });

  it('binds the confirmation fingerprint to route, provider, account, recipient, amount, and runtime', () => {
    const execution = bundledExecution(({ kind }) => kind === 'relay-native-xcm-v3');
    const props = {
      amount: '1',
      assetId: 'asset',
      assetKey: 'substrate:origin:asset',
      destinationNet: 'Destination',
      execution,
      from: 'sender',
      originNet: 'Origin',
      reviewedMinimum: null,
      routeId: 'route-a',
      routeProviderId: 'wallet-xcm' as const,
      to: 'recipient-a',
      tokenBalance: {} as never,
      xcmAssetId: execution.assetXcmId,
    };
    const fingerprint = (overrides: Partial<typeof props> = {}) =>
      createCrossChainQuoteFingerprint({
        destinationChainId: execution.destinationChainId,
        originChainId: execution.originChainId,
        precisionAmount: overrides.amount === '2' ? '20000000000' : '10000000000',
        props: { ...props, ...overrides },
        runtimeFingerprint: 'runtime-a',
        substrateAddress: overrides.from ?? 'sender',
      });

    expect(fingerprint()).not.toBe(fingerprint({ to: 'recipient-b' }));
    expect(fingerprint()).not.toBe(fingerprint({ amount: '2' }));
    expect(fingerprint()).not.toBe(fingerprint({ routeId: 'route-b' }));
    expect(fingerprint()).not.toBe(fingerprint({ from: 'other-sender' }));
  });

  it('reads the destination minimum and rejects exact Liberland registration drift', async () => {
    const execution = bundledExecution(
      (candidate) =>
        candidate.kind === 'sora-bridge-proxy-burn-v3' &&
        candidate.bridgeNetwork === 'Liberland' &&
        candidate.externalAsset === 1
    );
    if (execution.kind !== 'sora-bridge-proxy-burn-v3') throw new Error('Unexpected execution fixture');

    const soraQuery = {
      substrateBridgeApp: {
        assetKinds: vi.fn(async () => codec(execution.soraAssetKind)),
        sidechainAssetId: vi.fn(async () => codec('Asset(1)', { asset: 1 })),
        sidechainPrecision: vi.fn(async () => codec(execution.sidechainPrecision)),
      },
    };
    const destinationQuery = {
      assets: {
        asset: vi.fn(async () => codec('details', { details: true })),
      },
    };
    const details = codec('details') as ReturnType<typeof codec> & { minBalance?: ReturnType<typeof codec> };
    details.minBalance = codec('1000000000000');
    destinationQuery.assets.asset.mockResolvedValue(details);

    const originApi = authorityApi(execution.originChainId, soraQuery);
    const destinationApi = authorityApi(execution.destinationChainId, destinationQuery);
    const state = authorityState([
      { api: originApi, chainId: execution.originChainId, name: 'SORA Mainnet' },
      { api: destinationApi, chainId: execution.destinationChainId, name: 'Liberland' },
    ]);

    await expect(assertReviewedRuntimeAuthority(execution, state)).resolves.toMatchObject({ runtimeMinimum: '1' });

    soraQuery.substrateBridgeApp.sidechainAssetId.mockResolvedValue(codec('Asset(10)', { asset: 10 }));
    await expect(assertReviewedRuntimeAuthority(execution, state)).rejects.toThrow(
      'cross_chain_runtime_registration_drift'
    );
  });

  it('fails closed when an authoritative intermediate SORA parachain runtime is unavailable', async () => {
    const execution = bundledExecution(({ kind }) => kind === 'external-to-sora-xcm-v3');
    const originApi = authorityApi(execution.originChainId);
    const destinationApi = authorityApi(execution.destinationChainId, {
      parachainBridgeApp: {
        assetKinds: vi.fn(async () => codec('Sidechain')),
        relaychainAsset: vi.fn(async () => codec((execution as never as { soraAssetId: string }).soraAssetId)),
        sidechainPrecision: vi.fn(async () => codec(execution.assetPrecision)),
      },
    });
    const state = authorityState([
      { api: originApi, chainId: execution.originChainId, name: 'Origin' },
      { api: destinationApi, chainId: execution.destinationChainId, name: 'SORA Mainnet' },
    ]);

    await expect(assertReviewedRuntimeAuthority(execution, state)).rejects.toThrow('cross_chain_network_unavailable');
  });
});
