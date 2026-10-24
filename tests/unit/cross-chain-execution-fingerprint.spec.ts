import {
  createReviewedCrossChainExtrinsic,
  createReviewedExecutionFingerprint,
  createReviewedRelayExtrinsic,
} from '@/cross-chain/reviewedExecution';
import { BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES, type ReviewedRelayExecution } from '@/cross-chain/reviewedRoutes';
import { REVIEWED_RUNTIMES } from '@/cross-chain/reviewedRuntimes';
import { VALID_SUBSTRATE_ADDRESS } from '@/consts/networks';

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';

/** The bundled Polkadot to Polkadot Asset Hub teleport. */
const execution = BUNDLED_REVIEWED_CROSS_CHAIN_ROUTES.map((route) => route.execution).find(
  (candidate): candidate is Readonly<ReviewedRelayExecution> =>
    candidate?.kind === 'relay-native-xcm-v3' && candidate.originChainId === POLKADOT
)!;
const reviewed = REVIEWED_RUNTIMES.find(({ chainId }) => chainId === POLKADOT)!;

const request = () => ({
  execution,
  originChainId: execution.originChainId,
  destinationChainId: execution.destinationChainId,
  xcmAssetId: execution.assetXcmId,
  to: VALID_SUBSTRATE_ADDRESS,
  precisionAmount: '10000000000',
});

const teleport = () =>
  Object.assign(
    vi.fn((..._args: unknown[]) => ({ paymentInfo: vi.fn() })),
    {
      callIndex: Uint8Array.from([reviewed.calls[0].palletIndex, reviewed.calls[0].callIndex]),
      meta: {
        args: ['dest', 'beneficiary', 'assets', 'feeAssetItem', 'weightLimit'].map((name) => ({
          name: { toString: () => name },
        })),
      },
    }
  );

const runtime = (tx: Record<string, Record<string, unknown>>, specVersion = reviewed.specVersions.max) => ({
  isReadyOrError: Promise.resolve(),
  tx,
  createType: vi.fn((_type: string, value: unknown) => ({ toHex: () => String(value) })),
  genesisHash: { toHex: () => `0x${POLKADOT}` },
  runtimeVersion: {
    specName: { toString: () => reviewed.specName },
    specVersion: { toString: () => String(specVersion) },
  },
});

describe('cross-chain execution fingerprint', () => {
  it('fails closed when the exact reviewed pallet call is unavailable and never falls back', async () => {
    const injectedFallback = teleport();

    await expect(
      createReviewedRelayExtrinsic({
        ...request(),
        api: runtime({ xcmPallet: {}, polkadotXcm: { limitedTeleportAssets: injectedFallback } }),
      })
    ).rejects.toThrow('cross_chain_runtime_execution_drift');
    expect(injectedFallback).not.toHaveBeenCalled();
  });

  it('builds the asset location only from the bundled execution, never mutable remote locations', async () => {
    const reviewedCall = teleport();
    const attackerControlledRegistryLocation = [{ generalIndex: '999999' }];

    await createReviewedRelayExtrinsic({ ...request(), api: runtime({ xcmPallet: { limitedTeleportAssets: reviewedCall } }) });

    expect(reviewedCall).toHaveBeenCalledOnce();
    expect(reviewedCall.mock.calls[0][0]).toEqual({ V3: { interior: { X1: { Parachain: 1000 } }, parents: 0 } });
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

  it('refuses to encode a relay execution toward the same para id on another relay', async () => {
    const reviewedCall = teleport();
    const kusamaAssetHub = '48239ef607d7928874027a43a67689209727dfb3d3dc5e5b03a39bdc2eda771a';
    const crossRelay = { ...execution, destinationChainId: kusamaAssetHub };

    await expect(
      createReviewedCrossChainExtrinsic({
        ...request(),
        execution: crossRelay,
        destinationChainId: kusamaAssetHub,
        api: runtime({ xcmPallet: { limitedTeleportAssets: reviewedCall } }),
      })
    ).rejects.toThrow('cross_chain_execution_definition_mismatch');
    expect(reviewedCall).not.toHaveBeenCalled();
  });

  it('refuses to build on an upgraded runtime until that version is reviewed', async () => {
    const reviewedCall = teleport();

    await expect(
      createReviewedCrossChainExtrinsic({
        ...request(),
        api: runtime({ xcmPallet: { limitedTeleportAssets: reviewedCall } }, reviewed.specVersions.max + 1),
      })
    ).rejects.toThrow('cross_chain_runtime_not_reviewed');
    expect(reviewedCall).not.toHaveBeenCalled();
  });

  it('binds the runtime fingerprint to the runtime version, so a quote cannot be signed after an upgrade', async () => {
    const tx = { xcmPallet: { limitedTeleportAssets: teleport() } };
    const built = await createReviewedCrossChainExtrinsic({ ...request(), api: runtime(tx) });
    const upgraded = createReviewedExecutionFingerprint(
      execution,
      execution.callCandidates[0],
      runtime(tx, reviewed.specVersions.max + 1)
    );

    expect(built.executionFingerprint).toBe(
      createReviewedExecutionFingerprint(execution, execution.callCandidates[0], runtime(tx))
    );
    expect(upgraded).not.toBe(built.executionFingerprint);
  });
});
