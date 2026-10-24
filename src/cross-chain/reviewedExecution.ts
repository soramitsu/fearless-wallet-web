import { BN, isFunction } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';
import type { Extrinsic } from '@extension-base/api/substrate/types';
import type {
  ReviewedCrossChainExecution,
  ReviewedRelayExecution,
  ReviewedRuntimeCall,
} from '@/cross-chain/reviewedRoutes';

type RuntimeMethod = ((...args: unknown[]) => Extrinsic) & {
  meta?: { args?: Array<{ name: { toString(): string } }> };
};

export type ReviewedExecutionApi = {
  isReadyOrError: Promise<unknown>;
  tx: Record<string, Record<string, unknown>>;
  createType(type: string, value: unknown): { toHex(): string };
  genesisHash?: { toHex(): string };
  runtimeVersion?: {
    specName?: { toString(): string };
    specVersion?: { toString(): string };
  };
};

export type ResolvedReviewedExecution = {
  extrinsic: Extrinsic;
  executionFingerprint: string;
  runtimeCall: ReviewedRuntimeCall;
};

const formatInterior = (interiors: readonly Readonly<Record<string, unknown>>[]) => {
  const values = interiors.map((interior) =>
    Object.fromEntries(
      Object.entries(interior).map(([key, value]) => {
        const normalized = key.startsWith('generalKey') ? 'generalKey' : key;

        return [`${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`, value];
      })
    )
  );

  if (!values.length) return { Here: '' };

  return { [`X${values.length}`]: values.length === 1 ? values[0] : values };
};

function xcmAccountId32(api: ReviewedExecutionApi, address: string) {
  return {
    AccountId32: {
      id: api.createType('AccountId32', address).toHex(),
    },
  };
}

function getReviewedRelayParams(
  execution: Readonly<ReviewedRelayExecution>,
  to: string,
  precisionAmount: string,
  api: ReviewedExecutionApi
) {
  const network = { network: { [execution.relayNetwork]: '' } };
  const receiverLocation =
    execution.receiverKind === 'AccountKey20'
      ? { AccountKey20: { ...network, key: api.createType('AccountId20', to).toHex() } }
      : { AccountId32: { ...network, id: api.createType('AccountId32', to).toHex() } };

  return [
    {
      V3: {
        interior: { X1: { Parachain: execution.destinationParaId } },
        parents: 0,
      },
    },
    {
      V3: {
        parents: 0,
        interior: { X1: receiverLocation },
      },
    },
    {
      V3: [
        {
          fun: { Fungible: new BN(precisionAmount) },
          id: {
            Concrete: {
              parents: execution.assetParents,
              interior: formatInterior(execution.assetInteriors),
            },
          },
        },
      ],
    },
    0,
    { Unlimited: null },
  ];
}

function getExternalToSoraParams(
  execution: Extract<ReviewedCrossChainExecution, { kind: 'external-to-sora-xcm-v3' }>,
  to: string,
  precisionAmount: string,
  api: ReviewedExecutionApi
): unknown[] {
  const receiver = xcmAccountId32(api, to);

  if (execution.source === 'acala-native') {
    if (!execution.currencyId) throw new Error('cross_chain_execution_definition_mismatch');

    return [
      execution.currencyId,
      precisionAmount,
      {
        V3: {
          parents: 1,
          interior: {
            X2: [{ Parachain: execution.soraParachainId }, receiver],
          },
        },
      },
      { Unlimited: null },
    ];
  }

  const destinationParents = execution.source === 'relay-native' ? 0 : 1;

  return [
    {
      V3: {
        parents: destinationParents,
        interior: { X1: { Parachain: execution.soraParachainId } },
      },
    },
    {
      V3: {
        parents: 0,
        interior: { X1: receiver },
      },
    },
    {
      V3: [
        {
          id: { Concrete: { parents: 0, interior: 'Here' } },
          fun: { Fungible: new BN(precisionAmount) },
        },
      ],
    },
    0,
  ];
}

function getSoraBridgeParams(
  execution: Extract<ReviewedCrossChainExecution, { kind: 'sora-bridge-proxy-burn-v3' }>,
  to: string,
  precisionAmount: string,
  api: ReviewedExecutionApi
): unknown[] {
  let recipient: Record<string, unknown>;

  if (execution.recipientKind === 'liberland') {
    recipient = { Liberland: api.createType('AccountId32', to).toHex() };
  } else {
    const account = { AccountId32: { id: api.createType('AccountId32', to).toHex() } };
    const interior =
      execution.recipientKind === 'relay'
        ? { X1: account }
        : { X2: [{ Parachain: execution.destinationParaId }, account] };

    recipient = { Parachain: { V3: { parents: 1, interior } } };
  }

  return [{ Sub: execution.bridgeNetwork }, execution.soraAssetId, recipient, precisionAmount];
}

function getLiberlandToSoraParams(
  execution: Extract<ReviewedCrossChainExecution, { kind: 'liberland-to-sora-burn' }>,
  to: string,
  precisionAmount: string
): unknown[] {
  const assetId = execution.externalAsset === 'LLD' ? 'LLD' : { Asset: execution.externalAsset };

  return ['Mainnet', assetId, { Sora: to }, precisionAmount];
}

function metadataArgs(method: RuntimeMethod): string[] {
  return method.meta?.args?.map(({ name }) => name.toString()) ?? [];
}

export function resolveReviewedRuntimeCall(
  execution: Readonly<ReviewedCrossChainExecution>,
  api: ReviewedExecutionApi
): { descriptor: ReviewedRuntimeCall; method: RuntimeMethod } {
  for (const descriptor of execution.callCandidates) {
    const method = api.tx[descriptor.pallet]?.[descriptor.call];

    if (!isFunction(method)) continue;

    const runtimeArgs = metadataArgs(method as RuntimeMethod);
    if (
      runtimeArgs.length !== descriptor.args.length ||
      runtimeArgs.some((arg, index) => arg !== descriptor.args[index])
    ) {
      continue;
    }

    return { descriptor, method: method as RuntimeMethod };
  }

  throw new Error('cross_chain_runtime_execution_drift');
}

export function createReviewedExecutionFingerprint(
  execution: Readonly<ReviewedCrossChainExecution>,
  runtimeCall: ReviewedRuntimeCall,
  api: ReviewedExecutionApi
): string {
  const value = JSON.stringify({
    execution,
    runtimeCall,
    genesisHash: api.genesisHash?.toHex() ?? '',
    specName: api.runtimeVersion?.specName?.toString() ?? '',
    specVersion: api.runtimeVersion?.specVersion?.toString() ?? '',
  });

  return blake2AsHex(value);
}

export async function createReviewedCrossChainExtrinsic({
  execution,
  originChainId,
  destinationChainId,
  xcmAssetId,
  to,
  precisionAmount,
  api,
}: {
  execution: Readonly<ReviewedCrossChainExecution>;
  originChainId: string;
  destinationChainId: string;
  xcmAssetId: string;
  to: string;
  precisionAmount: string;
  api: ReviewedExecutionApi;
}): Promise<ResolvedReviewedExecution> {
  if (
    execution.assetXcmId !== xcmAssetId ||
    originChainId !== execution.originChainId ||
    destinationChainId !== execution.destinationChainId
  ) {
    throw new Error('cross_chain_execution_fingerprint_mismatch');
  }

  await api.isReadyOrError;

  const { descriptor, method } = resolveReviewedRuntimeCall(execution, api);
  let params: unknown[];

  switch (execution.kind) {
    case 'relay-native-xcm-v3':
      params = getReviewedRelayParams(execution, to, precisionAmount, api);
      break;
    case 'external-to-sora-xcm-v3':
      params = getExternalToSoraParams(execution, to, precisionAmount, api);
      break;
    case 'sora-bridge-proxy-burn-v3':
      params = getSoraBridgeParams(execution, to, precisionAmount, api);
      break;
    case 'liberland-to-sora-burn':
      params = getLiberlandToSoraParams(execution, to, precisionAmount);
      break;
  }

  const extrinsic = method(...params);

  return {
    extrinsic,
    executionFingerprint: createReviewedExecutionFingerprint(execution, descriptor, api),
    runtimeCall: descriptor,
  };
}

/** Compatibility wrapper retained for the existing reviewed wallet-XCM tests. */
export async function createReviewedRelayExtrinsic(
  props: Parameters<typeof createReviewedCrossChainExtrinsic>[0] & {
    execution: Readonly<ReviewedRelayExecution>;
  }
): Promise<Extrinsic> {
  return (await createReviewedCrossChainExtrinsic(props)).extrinsic;
}
