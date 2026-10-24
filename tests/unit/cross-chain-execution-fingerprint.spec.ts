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
});
