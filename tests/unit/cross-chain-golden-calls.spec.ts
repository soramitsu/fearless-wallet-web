import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Metadata, TypeRegistry, expandMetadata } from '@polkadot/types';
import { u8aToHex } from '@polkadot/util';
import { blake2AsHex, decodeAddress } from '@polkadot/util-crypto';
import { assertReviewedCallLayout, expectedReviewedCall } from '@/cross-chain/reviewedCallLayout';
import { createReviewedCrossChainExtrinsic, type ReviewedExecutionApi } from '@/cross-chain/reviewedExecution';
import { BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES, type ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';
import { REVIEWED_RUNTIMES } from '@/cross-chain/reviewedRuntimes';

const FIXTURES = resolve(__dirname, '../fixtures');

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';
const LIBERLAND = '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6';

/** Public key of the well-known development account //Alice, in each chain's address format below. */
const ALICE = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';

const SNAPSHOTS: Readonly<Record<string, string>> = {
  [POLKADOT]: 'polkadot-2005000.scale.gz',
  [KUSAMA]: 'kusama-2003002.scale.gz',
  [LIBERLAND]: 'liberland-34.scale.gz',
};

/**
 * Encoded calls for every bundled execution. Each one was produced by the live runtime at the pinned spec version
 * (2026-10-24) and by the snapshot below, byte for byte the same.
 */
const GOLDEN = [
  {
    symbol: 'DOT',
    originChainId: POLKADOT,
    to: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
    amount: '15000000000',
    call: '0x630903000100a10f030001010102d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0304000000000700d6117e030000000000',
  },
  {
    symbol: 'KSM',
    originChainId: KUSAMA,
    to: 'HNZata7iMYWmk5RvZRTiAsSDhV8366zq2YGb3tLH5Upf74F',
    amount: '500000000000',
    call: '0x630903000100a10f030001010103d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d030400000000070088526a740000000000',
  },
  {
    symbol: 'LLD',
    originChainId: LIBERLAND,
    to: 'cnWHXYTKQwMV96ZuTKbqTA23FuPcmWjrDyLNzCXYL92G9tmtm',
    amount: '2000000000000',
    call: '0x5103000001d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d00204aa9d10100000000000000000000',
  },
  {
    symbol: 'LLM',
    originChainId: LIBERLAND,
    to: 'cnWHXYTKQwMV96ZuTKbqTA23FuPcmWjrDyLNzCXYL92G9tmtm',
    amount: '3000000000000',
    call: '0x510300010100000001d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0030ef7dba0200000000000000000000',
  },
  {
    symbol: 'XOR',
    originChainId: LIBERLAND,
    to: 'cnWHXYTKQwMV96ZuTKbqTA23FuPcmWjrDyLNzCXYL92G9tmtm',
    amount: '250000000000000000',
    call: '0x51030001150b292e01d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0000d9e9ac2d78030000000000000000',
  },
] as const;

type RuntimeCallsFixture = {
  runtimes: Array<{ chainId: string; specVersion: string; metadataBlake2?: string }>;
};

const runtimeCalls = JSON.parse(
  readFileSync(resolve(FIXTURES, 'contracts/cross-chain-runtime-calls-v1.json'), 'utf8')
) as RuntimeCallsFixture;

const snapshotBytes = (chainId: string) => gunzipSync(readFileSync(resolve(FIXTURES, 'metadata', SNAPSHOTS[chainId])));

const runtimes = new Map<string, { api: ReviewedExecutionApi; registry: TypeRegistry }>();

type DecoratedCall = ((...args: unknown[]) => { toHex(): string }) & { meta: unknown; callIndex: Uint8Array };

/** Like `api.tx`: every call method returns an unsigned extrinsic whose `method` is the encoded call. */
function submittableTx(registry: TypeRegistry, decorated: Record<string, Record<string, DecoratedCall>>) {
  return Object.fromEntries(
    Object.entries(decorated).map(([section, methods]) => [
      section,
      Object.fromEntries(
        Object.entries(methods).map(([name, call]) => [
          name,
          Object.assign((...args: unknown[]) => registry.createType('Extrinsic', call(...args)), {
            meta: call.meta,
            callIndex: call.callIndex,
          }),
        ])
      ),
    ])
  ) as unknown as ReviewedExecutionApi['tx'];
}

/** An API shaped like the live one, but decorated from the saved metadata of the reviewed runtime. */
function snapshotRuntime(chainId: string) {
  const cached = runtimes.get(chainId);
  if (cached) return cached;

  const reviewed = REVIEWED_RUNTIMES.find((runtime) => runtime.chainId === chainId)!;
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, snapshotBytes(chainId));
  registry.setMetadata(metadata);
  const runtime = {
    registry,
    api: {
      isReadyOrError: Promise.resolve(),
      tx: submittableTx(registry, expandMetadata(registry, metadata).tx as unknown as Record<string, Record<string, DecoratedCall>>),
      createType: (type: string, value: unknown) => registry.createType(type, value),
      genesisHash: { toHex: () => `0x${chainId}` },
      runtimeVersion: {
        specName: { toString: () => reviewed.specName },
        specVersion: { toString: () => String(reviewed.specVersions.max) },
      },
    } satisfies ReviewedExecutionApi,
  };
  runtimes.set(chainId, runtime);

  return runtime;
}

const routeFor = (symbol: string) => BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.find((route) => route.symbol === symbol)!;

async function buildCall(
  execution: Readonly<ReviewedCrossChainExecution>,
  to: string,
  amount: string,
  api: ReviewedExecutionApi = snapshotRuntime(execution.originChainId).api
) {
  const built = await createReviewedCrossChainExtrinsic({
    execution,
    originChainId: execution.originChainId,
    destinationChainId: execution.destinationChainId,
    xcmAssetId: execution.assetXcmId,
    to,
    precisionAmount: amount,
    api,
  });

  return (built.extrinsic as unknown as { method: { toHex(): string } }).method.toHex();
}

describe('golden encoded calls of the bundled cross-chain executions', () => {
  it('has a golden call for every bundled execution', () => {
    expect(GOLDEN.map(({ symbol }) => symbol).sort()).toEqual(
      BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map(({ symbol }) => symbol).sort()
    );
  });

  it.each(Object.keys(SNAPSHOTS))('uses the metadata recorded for the reviewed runtime of %s', (chainId) => {
    const recorded = runtimeCalls.runtimes.find((runtime) => runtime.chainId === chainId);
    const reviewed = REVIEWED_RUNTIMES.find((runtime) => runtime.chainId === chainId);

    expect(blake2AsHex(snapshotBytes(chainId))).toBe(recorded?.metadataBlake2);
    expect(SNAPSHOTS[chainId]).toContain(`-${recorded?.specVersion}.`);
    expect(Number(recorded?.specVersion)).toBe(reviewed?.specVersions.max);
  });

  it.each(GOLDEN)('encodes the $symbol route exactly as reviewed', async ({ symbol, originChainId, to, amount, call }) => {
    const execution = routeFor(symbol).execution!;

    expect(execution.originChainId).toBe(originChainId);
    await expect(buildCall(execution, to, amount)).resolves.toBe(call);
  });

  it('decodes the relay teleports to the Asset Hub of the same relay, the recipient and the amount', () => {
    const relayNetwork = { DOT: { polkadot: null }, KSM: { kusama: null } } as const;

    for (const { symbol, originChainId, call, amount } of GOLDEN.filter(({ symbol }) => symbol === 'DOT' || symbol === 'KSM')) {
      const decoded = snapshotRuntime(originChainId).registry.createType('Call', call);
      const { args } = decoded.toJSON() as { args: Record<string, unknown> };

      expect(`${decoded.section}.${decoded.method}`).toBe('xcmPallet.limitedTeleportAssets');
      expect(args.dest).toEqual({ v3: { parents: 0, interior: { x1: { parachain: 1000 } } } });
      expect(args.beneficiary).toEqual({
        v3: {
          parents: 0,
          interior: { x1: { accountId32: { network: relayNetwork[symbol as keyof typeof relayNetwork], id: ALICE } } },
        },
      });
      expect(args.assets).toEqual({
        v3: [{ id: { concrete: { parents: 0, interior: { here: null } } }, fun: { fungible: Number(amount) } }],
      });
      expect(args.fee_asset_item).toBe(0);
      expect(args.weight_limit).toEqual({ unlimited: null });
    }
  });

  it('decodes the Liberland burns to the SORA recipient, the reviewed asset and the amount', () => {
    const expectedAsset = { LLD: { lld: null }, LLM: { asset: 1 }, XOR: { asset: 774441749 } } as const;

    for (const { symbol, call, amount } of GOLDEN.filter(({ originChainId }) => originChainId === LIBERLAND)) {
      const decoded = snapshotRuntime(LIBERLAND).registry.createType('Call', call);
      const { args } = decoded.toJSON() as { args: Record<string, unknown> };

      expect(`${decoded.section}.${decoded.method}`).toBe('soraBridgeApp.burn');
      expect(args.network_id).toBe('Mainnet');
      expect(args.asset_id).toEqual(expectedAsset[symbol as keyof typeof expectedAsset]);
      expect(u8aToHex(decodeAddress((args.recipient as { sora: string }).sora))).toBe(ALICE);
      expect(BigInt(args.amount as string | number)).toBe(BigInt(amount));
    }
  });

  it.each(GOLDEN)('writes the $symbol call out independently of the node metadata', ({ symbol, to, amount, call }) => {
    expect(expectedReviewedCall(routeFor(symbol).execution!, to, amount)).toBe(call);
  });

  it('refuses a call that a node with altered type definitions encoded differently', async () => {
    const dot = GOLDEN[0];
    const execution = routeFor('DOT').execution!;
    const { api, registry } = snapshotRuntime(POLKADOT);
    // The node's types turn the reviewed recipient into another account.
    const hostile: ReviewedExecutionApi = {
      ...api,
      createType: (type: string, value: unknown) =>
        registry.createType(type, type === 'AccountId32' ? '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3' : value),
    };

    await expect(buildCall(execution, dot.to, dot.amount, hostile)).rejects.toThrow('cross_chain_call_layout_mismatch');
  });

  it('refuses a built call without encoded bytes', () => {
    const dot = GOLDEN[0];

    expect(() => assertReviewedCallLayout(routeFor('DOT').execution!, dot.to, dot.amount, undefined)).toThrow(
      'cross_chain_call_layout_mismatch'
    );
  });

  it.each([
    ['a fractional amount', '1.5'],
    ['a negative amount', '-1'],
    ['an amount above u128', (1n << 128n).toString()],
  ])('has no layout for %s', (_label, amount) => {
    expect(() => expectedReviewedCall(routeFor('DOT').execution!, GOLDEN[0].to, amount)).toThrow(
      'cross_chain_call_layout_not_reviewed'
    );
  });

  it('has no layout for an execution kind without a bundled route', () => {
    const relay = routeFor('DOT').execution!;
    const reserve = { ...relay, call: 'limitedReserveTransferAssets' } as Readonly<ReviewedCrossChainExecution>;
    const accountKey20 = { ...relay, receiverKind: 'AccountKey20' } as Readonly<ReviewedCrossChainExecution>;
    const soraBurn = { ...relay, kind: 'sora-bridge-proxy-burn-v3' } as unknown as Readonly<ReviewedCrossChainExecution>;

    for (const execution of [reserve, accountKey20, soraBurn]) {
      expect(() => expectedReviewedCall(execution, GOLDEN[0].to, GOLDEN[0].amount)).toThrow(
        'cross_chain_call_layout_not_reviewed'
      );
    }
  });

  it('changes the bytes when the recipient or the amount changes', async () => {
    const dot = GOLDEN[0];
    const execution = routeFor('DOT').execution!;

    await expect(buildCall(execution, dot.to, '15000000001')).resolves.not.toBe(dot.call);
    await expect(buildCall(execution, '14E5nqKAp3oAJcmzgZhUD2RcptBeUBScxKHgJKU4HPNcKVf3', dot.amount)).resolves.not.toBe(
      dot.call
    );
  });
});
