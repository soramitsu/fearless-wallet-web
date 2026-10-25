import type { ReviewedCrossChainExecution } from '@/cross-chain/reviewedRoutes';
import { assertOriginExecutes, type DryRunApi } from '@/cross-chain/originDryRun';

const relayExecution = {
  kind: 'relay-native-xcm-v3',
  originChainId: 'relay',
  destinationChainId: 'asset-hub',
  assetXcmId: 'dot',
  assetPrecision: 10,
  pallet: 'xcmPallet',
  call: 'limitedTeleportAssets',
  callCandidates: [],
  destinationFee: '0.001',
  relayNetwork: 'Polkadot',
  destinationParaId: 1000,
  receiverKind: 'AccountId32',
  assetParents: 0,
  assetInteriors: [],
} as unknown as Readonly<ReviewedCrossChainExecution>;

const bridgeExecution = { ...relayExecution, kind: 'sora-bridge-proxy-burn-v3' } as unknown as Readonly<ReviewedCrossChainExecution>;

const SIGNER = '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5';
const extrinsic = { method: { section: 'xcmPallet', method: 'limitedTeleportAssets' } };

const apiReturning = (outcome: unknown) => {
  const dryRunCall = vi.fn(async () => outcome as never);
  const api: DryRunApi = { call: { dryRunApi: { dryRunCall } } };

  return { api, dryRunCall };
};

describe('quote-time dry run of the origin call', () => {
  it('lets a call through when the origin runtime executes it', async () => {
    const { api, dryRunCall } = apiReturning({ isOk: true, asOk: { executionResult: { isOk: true } } });

    await expect(assertOriginExecutes(relayExecution, api, extrinsic, SIGNER)).resolves.toBeUndefined();
    expect(dryRunCall).toHaveBeenCalledWith({ system: { Signed: SIGNER } }, extrinsic.method, 4);
  });

  it('refuses a call whose dispatch fails, as relay reserve transfers do since the Asset Hub Migration', async () => {
    const { api } = apiReturning({ isOk: true, asOk: { executionResult: { isOk: false } } });

    await expect(assertOriginExecutes(relayExecution, api, extrinsic, SIGNER)).rejects.toThrow(
      'cross_chain_dry_run_failed'
    );
  });

  it('refuses a dry run that itself returns an error', async () => {
    const { api } = apiReturning({ isOk: false, asOk: { executionResult: { isOk: true } } });

    await expect(assertOriginExecutes(relayExecution, api, extrinsic, SIGNER)).rejects.toThrow(
      'cross_chain_dry_run_failed'
    );
  });

  it('fails closed when the origin runtime has no dry-run API', async () => {
    await expect(assertOriginExecutes(relayExecution, {}, extrinsic, SIGNER)).rejects.toThrow(
      'cross_chain_dry_run_unavailable'
    );
    await expect(assertOriginExecutes(relayExecution, { call: { dryRunApi: {} } }, extrinsic, SIGNER)).rejects.toThrow(
      'cross_chain_dry_run_unavailable'
    );
  });

  it('fails closed when the node cannot answer the runtime call', async () => {
    const api: DryRunApi = {
      call: {
        dryRunApi: {
          dryRunCall: vi.fn(async () => {
            throw new Error('state_call is not allowed');
          }),
        },
      },
    };

    await expect(assertOriginExecutes(relayExecution, api, extrinsic, SIGNER)).rejects.toThrow(
      'cross_chain_dry_run_unavailable'
    );
  });

  it('leaves bridge executions to their own authority checks', async () => {
    const { api, dryRunCall } = apiReturning({ isOk: false, asOk: { executionResult: { isOk: false } } });

    await expect(assertOriginExecutes(bridgeExecution, api, extrinsic, SIGNER)).resolves.toBeUndefined();
    await expect(assertOriginExecutes(bridgeExecution, {}, extrinsic, SIGNER)).resolves.toBeUndefined();
    expect(dryRunCall).not.toHaveBeenCalled();
  });
});
