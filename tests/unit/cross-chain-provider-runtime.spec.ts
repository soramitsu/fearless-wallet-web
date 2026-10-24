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

/**
 * SORA to Liberland is no longer bundled (its latest transfers stay pending), but the burn builder and the
 * registration authority check stay reachable for a requalified route, so they keep being exercised here.
 */
const soraToLiberlandBurn: Readonly<ReviewedCrossChainExecution> = {
  kind: 'sora-bridge-proxy-burn-v3',
  originChainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
  destinationChainId: '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6',
  assetXcmId: '0ef3afdc-cdd3-47cc-bd52-817c54ae65b5',
  assetPrecision: 18,
  bridgeNetwork: 'Liberland',
  recipientKind: 'liberland',
  soraAssetId: '0x00073edd278e1bd6a7f9d0b27d4f3e93b73c8f0832b58a4df13c69611a99f156',
  soraAssetKind: 'Sidechain',
  sidechainPrecision: 12,
  externalAsset: 1,
  callCandidates: [{ pallet: 'bridgeProxy', call: 'burn', args: ['networkId', 'assetId', 'recipient', 'amount'] }],
  destinationFee: '0',
  destinationMinimum: { kind: 'assets-min-balance', assetId: 1, precision: 12 },
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
    // Only Liberland to SORA still delivers; every other bridge route is retired (see cross-chain-retired-routes.spec.ts).
    expect(new Set(bridgeRoutes.map(({ execution }) => execution?.kind))).toEqual(new Set(['liberland-to-sora-burn']));
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
    const sora = soraToLiberlandBurn;
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
    const execution = soraToLiberlandBurn;
    if (execution.kind !== 'sora-bridge-proxy-burn-v3') throw new Error('Unexpected execution fixture');

    // Live shape on SORA spec 134: a GenericAssetId whose Liberland variant wraps Asset(1).
    const soraQuery = {
      substrateBridgeApp: {
        assetKinds: vi.fn(async () => codec(execution.soraAssetKind)),
        sidechainAssetId: vi.fn(async () => codec('Liberland(Asset(1))', { liberland: { asset: 1 } })),
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

    soraQuery.substrateBridgeApp.sidechainAssetId.mockResolvedValue(
      codec('Liberland(Asset(10))', { liberland: { asset: 10 } })
    );
    await expect(assertReviewedRuntimeAuthority(execution, state)).rejects.toThrow(
      'cross_chain_runtime_registration_drift'
    );
  });

  describe('registration of the bundled Liberland to SORA routes', () => {
    // Values read from SORA spec 134 (substrateBridgeApp, network Liberland) on 2026-10-24.
    const live: Record<string, { kind: string; precision: number; sidechainAssetId: unknown }> = {
      LLD: { kind: 'Sidechain', precision: 12, sidechainAssetId: { liberland: { lld: null } } },
      LLM: { kind: 'Sidechain', precision: 12, sidechainAssetId: { liberland: { asset: 1 } } },
      XOR: { kind: 'Thischain', precision: 18, sidechainAssetId: { liberland: { asset: 774441749 } } },
    };
    const liberlandRoutes = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.filter(
      ({ execution }) => execution?.kind === 'liberland-to-sora-burn'
    );

    const runAuthority = async (symbol: string, sidechainAssetId: unknown, kind = live[symbol].kind) => {
      const route = liberlandRoutes.find((candidate) => candidate.symbol === symbol)!;
      const execution = route.execution!;
      const soraApi = authorityApi(execution.destinationChainId, {
        substrateBridgeApp: {
          assetKinds: vi.fn(async () => codec(kind)),
          sidechainAssetId: vi.fn(async () => codec(JSON.stringify(sidechainAssetId), sidechainAssetId)),
          sidechainPrecision: vi.fn(async () => codec(live[symbol].precision)),
        },
      });
      const liberlandApi = authorityApi(execution.originChainId);
      const state = authorityState([
        { api: liberlandApi, chainId: execution.originChainId, name: 'Liberland' },
        { api: soraApi, chainId: execution.destinationChainId, name: 'SORA Mainnet' },
      ]);

      return assertReviewedRuntimeAuthority(execution, state);
    };

    it('bundles exactly the LLD, LLM and XOR directions', () => {
      expect(liberlandRoutes.map(({ symbol }) => symbol).sort()).toEqual(['LLD', 'LLM', 'XOR']);
    });

    it.each(['LLD', 'LLM', 'XOR'])('accepts the live registration of %s', async (symbol) => {
      await expect(runAuthority(symbol, live[symbol].sidechainAssetId)).resolves.toMatchObject({ runtimeMinimum: '0' });
    });

    it.each([
      ['LLD', { liberland: { asset: 0 } }],
      ['LLD', { lld: null }],
      ['LLM', { liberland: { asset: 2 } }],
      ['LLM', { asset: 1 }],
      ['LLM', { liberland: { lld: null } }],
      ['XOR', { liberland: { asset: 774441750 } }],
      ['XOR', { sora: '0x0200000000000000000000000000000000000000000000000000000000000000' }],
      ['XOR', { liberland: { asset: '774441749x' } }],
    ])('rejects a drifted registration of %s: %j', async (symbol, sidechainAssetId) => {
      await expect(runAuthority(symbol, sidechainAssetId)).rejects.toThrow('cross_chain_runtime_registration_drift');
    });

    it('rejects a changed asset kind', async () => {
      await expect(runAuthority('XOR', live.XOR.sidechainAssetId, 'Sidechain')).rejects.toThrow(
        'cross_chain_runtime_registration_drift'
      );
    });
  });

  it('fails closed when an authoritative intermediate SORA parachain runtime is unavailable', async () => {
    // No external-to-SORA route is bundled any more, so the execution shape is built here.
    const execution: Readonly<ReviewedCrossChainExecution> = {
      kind: 'external-to-sora-xcm-v3',
      originChainId: 'fc41b9bd8ef8fe53d58c7ea67c794c7ec9a73daf05e6d54b14ff6342c99ba64c',
      destinationChainId: '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5',
      assetXcmId: 'aca',
      assetPrecision: 12,
      source: 'acala-native',
      relayNetwork: 'Polkadot',
      soraParachainId: 2025,
      soraParachainChainId: 'e92d165ad41e41e215d09713788173aecfdbe34d3bed29409d33a2ef03980738',
      soraAssetId: '0x001ddbe1a880031da72f7ea421260bec635fa7d1aa72593d5412795408b6b2ba',
      soraAssetKind: 'Sidechain',
      bridgeNetwork: 'Polkadot',
      bridgeParachainId: 2000,
      callCandidates: [],
      destinationFee: '0',
      destinationMinimum: {
        kind: 'sora-parachain-asset-minimum',
        chainId: 'e92d165ad41e41e215d09713788173aecfdbe34d3bed29409d33a2ef03980738',
        assetId: '0x001ddbe1a880031da72f7ea421260bec635fa7d1aa72593d5412795408b6b2ba',
        precision: 12,
      },
    };
    const originApi = authorityApi(execution.originChainId);
    const soraAssetId = (execution as never as { soraAssetId: string }).soraAssetId;
    const destinationApi = authorityApi(execution.destinationChainId, {
      parachainBridgeApp: {
        allowedParachainAssets: vi.fn(async () => [codec(soraAssetId)] as never),
        assetKinds: vi.fn(async () => codec('Sidechain')),
        relaychainAsset: vi.fn(async () => codec(soraAssetId)),
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
