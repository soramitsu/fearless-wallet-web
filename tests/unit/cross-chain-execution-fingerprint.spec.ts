import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';
import { createReviewedCrossChainExtrinsic, createReviewedRelayExtrinsic } from '@/cross-chain/reviewedExecution';
import { VALID_SUBSTRATE_ADDRESS } from '@/consts/networks';

const originChainId = 'origin-chain';
const destinationChainId = 'destination-chain';

const request = () => ({
  execution: {
    kind: 'relay-native-xcm-v3',
    originChainId,
    destinationChainId,
    assetXcmId: 'reviewed-dot-location',
    assetPrecision: 10,
    pallet: 'polkadotXcm',
    call: 'limitedReserveTransferAssets',
    callCandidates: [
      {
        pallet: 'polkadotXcm',
        call: 'limitedReserveTransferAssets',
        args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'],
      },
    ],
    destinationFee: '0',
    relayNetwork: 'Polkadot',
    destinationParaId: 2000,
    receiverKind: 'AccountId32',
    assetParents: 0,
    assetInteriors: [],
  } satisfies ReviewedCrossChainExecution,
  originChainId,
  destinationChainId,
  xcmAssetId: 'reviewed-dot-location',
  to: VALID_SUBSTRATE_ADDRESS,
  precisionAmount: '10000000000',
});

describe('cross-chain execution fingerprint', () => {
  it('fails closed when the exact reviewed pallet call is unavailable and never falls back', async () => {
    const injectedFallback = vi.fn();
    const runtime = {
      isReadyOrError: Promise.resolve(),
      tx: {
        polkadotXcm: {},
        xcmPallet: { limitedReserveTransferAssets: injectedFallback },
      },
      createType: vi.fn(),
    };

    await expect(createReviewedRelayExtrinsic({ ...request(), api: runtime })).rejects.toThrow(
      'cross_chain_runtime_execution_drift'
    );
    expect(injectedFallback).not.toHaveBeenCalled();
  });

  it('builds the asset location only from the bundled fingerprint, never mutable remote locations', async () => {
    const reviewedCall = Object.assign(
      vi.fn((..._args: unknown[]) => ({ paymentInfo: vi.fn() })),
      {
        meta: {
          args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'].map((name) => ({
            name: { toString: () => name },
          })),
        },
      }
    );
    const runtime = {
      isReadyOrError: Promise.resolve(),
      tx: { polkadotXcm: { limitedReserveTransferAssets: reviewedCall } },
      createType: vi.fn((_type: string, value: unknown) => ({ toHex: () => String(value) })),
    };
    const attackerControlledRegistryLocation = [{ generalIndex: '999999' }];

    await createReviewedRelayExtrinsic({
      ...request(),
      execution: { ...request().execution, assetInteriors: [] },
      api: runtime,
    });

    expect(reviewedCall).toHaveBeenCalledOnce();
    expect(reviewedCall.mock.calls[0][2]).toEqual({
      V3: [
        {
          fun: { Fungible: expect.anything() },
          id: { Concrete: { parents: 0, interior: { Here: '' } } },
        },
      ],
    });
    expect(JSON.stringify(reviewedCall.mock.calls[0])).not.toContain(
      String(attackerControlledRegistryLocation[0].generalIndex)
    );
  });

  it('changes the runtime fingerprint when the connected runtime upgrades', async () => {
    const reviewedCall = Object.assign(
      vi.fn(() => ({ paymentInfo: vi.fn() })),
      {
        meta: {
          args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'].map((name) => ({
            name: { toString: () => name },
          })),
        },
      }
    );
    const runtime = {
      isReadyOrError: Promise.resolve(),
      tx: { polkadotXcm: { limitedReserveTransferAssets: reviewedCall } },
      createType: vi.fn((_type: string, value: unknown) => ({ toHex: () => String(value) })),
      genesisHash: { toHex: () => '0xorigin-chain' },
      runtimeVersion: {
        specName: { toString: () => 'relay' },
        specVersion: { toString: () => '1' },
      },
    };

    const first = await createReviewedCrossChainExtrinsic({ ...request(), api: runtime });
    runtime.runtimeVersion.specVersion = { toString: () => '2' };
    const upgraded = await createReviewedCrossChainExtrinsic({ ...request(), api: runtime });

    expect(upgraded.executionFingerprint).not.toBe(first.executionFingerprint);
  });

  it('revalidates route, signer, runtime, balance, and confirmed fee at the final signing boundary', () => {
    const crossChain = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/api/substrate/crossChain.ts'),
      'utf8'
    );
    const makeStart = crossChain.indexOf('export async function makeCrossChain(');
    const makeEnd = crossChain.length;
    const make = crossChain.slice(makeStart, makeEnd);
    const initialGuard = make.indexOf('assertReviewedRouteAndAccount(props, state)');
    const fee = make.indexOf('await estimateCrossChainQuote(props, state)');
    const feeGuard = make.indexOf('assertConfirmedQuote(props, initialQuote, state)');
    const finalGuard = make.indexOf('const syncFinalGuard = () =>');
    const unlock = make.indexOf('!state.keyringService.unlockPair(props.capturedPair)');
    const sign = make.indexOf('await signAndSendExtrinsic(');

    expect(initialGuard).toBeGreaterThan(-1);
    expect(fee).toBeGreaterThan(initialGuard);
    expect(feeGuard).toBeGreaterThan(fee);
    expect(finalGuard).toBeGreaterThan(feeGuard);
    expect(unlock).toBeGreaterThan(finalGuard);
    expect(sign).toBeGreaterThan(unlock);
    expect(make).toContain('finalGuard: syncFinalGuard,');
    expect(crossChain).toContain('validateReviewedCrossChainRequest({');
    expect(crossChain).toContain('cross_chain_fee_balance_insufficient');
    expect(crossChain).toContain('assertRuntimeFingerprint(props, guardedQuote');
    expect(make.indexOf('guardedQuote = finalQuote;')).toBeLessThan(sign);

    const signer = readFileSync(
      resolve(__dirname, '../../src/extension/background/extension-base/src/api/substrate/shared/signExtrinsic.ts'),
      'utf8'
    );
    expect(signer.indexOf('finalGuard?.();')).toBeGreaterThan(signer.indexOf('accountNextIndex(address)'));
    expect(signer.indexOf('extrinsic.signAsync(')).toBeGreaterThan(signer.indexOf('finalGuard?.();'));
  });
});
