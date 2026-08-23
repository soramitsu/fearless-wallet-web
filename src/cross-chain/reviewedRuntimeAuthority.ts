import { FPNumber } from '@sora-substrate/util';
import type State from '@extension-base/background/handlers/State';
import type { ReviewedExecutionApi } from '@/cross-chain/reviewedExecution';
import type { ReviewedCrossChainExecution, ReviewedDestinationMinimum } from '@/cross-chain/reviewedRoutes';

type Codec = {
  isEmpty?: boolean;
  isSome?: boolean;
  unwrap?: () => Codec;
  toHex?: () => string;
  toJSON?: () => unknown;
  toNumber?: () => number;
  toString: () => string;
  [key: string]: unknown;
};

type RuntimeQuery = (...args: unknown[]) => Promise<Codec>;

export type BridgeRuntimeApi = ReviewedExecutionApi & {
  isConnected?: boolean;
  query: Record<string, Record<string, RuntimeQuery>>;
  consts?: Record<string, Record<string, Codec>>;
  rpc?: Record<string, Record<string, RuntimeQuery>>;
};

function unwrap(value: Codec): Codec {
  if (value.isEmpty || value.isSome === false) throw new Error('cross_chain_runtime_registration_missing');

  return value.unwrap ? value.unwrap() : value;
}

function codecAssetId(value: Codec): string {
  const unwrapped = unwrap(value);

  return (unwrapped.toHex?.() ?? unwrapped.toString()).toLowerCase();
}

function codecNumber(value: Codec): number {
  const unwrapped = unwrap(value);
  const number = unwrapped.toNumber?.() ?? Number(unwrapped.toString());

  if (!Number.isSafeInteger(number) || number < 0) throw new Error('cross_chain_runtime_registration_drift');

  return number;
}

function codecKind(value: Codec): string {
  return unwrap(value).toString().trim().toLowerCase();
}

async function runtimeForChain(state: State, chainId: string): Promise<BridgeRuntimeApi> {
  const matches = state.networkService.networkValues.filter((network) => String(network.chainId) === chainId);

  if (matches.length !== 1) throw new Error('cross_chain_network_unavailable');

  const network = matches[0];
  const networkKey = network.name.toLowerCase();
  let api = state.getSubstrateApiMap[networkKey]?.api as unknown as BridgeRuntimeApi | undefined;

  if (!api || api.isConnected === false) {
    state.networkService.substrateApiHandler.initApi(network);
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      api = state.getSubstrateApiMap[networkKey]?.api as unknown as BridgeRuntimeApi | undefined;
      if (api && api.isConnected !== false) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  if (!api || api.isConnected === false) throw new Error('cross_chain_runtime_unavailable');

  return api;
}

function assertGenesis(api: BridgeRuntimeApi, expectedChainId: string): void {
  if (api.genesisHash?.toHex().replace(/^0x/, '').toLowerCase() !== expectedChainId.toLowerCase()) {
    throw new Error('cross_chain_runtime_genesis_mismatch');
  }
}

async function assertAssetKindAndPrecision({
  api,
  pallet,
  network,
  assetId,
  expectedKind,
  expectedPrecision,
}: {
  api: BridgeRuntimeApi;
  pallet: 'parachainBridgeApp' | 'substrateBridgeApp';
  network: 'Polkadot' | 'Kusama' | 'Liberland';
  assetId: string;
  expectedKind: 'Thischain' | 'Sidechain';
  expectedPrecision: number;
}): Promise<void> {
  const assetKinds = api.query[pallet]?.assetKinds;
  const sidechainPrecision = api.query[pallet]?.sidechainPrecision;
  if (!assetKinds || !sidechainPrecision) throw new Error('cross_chain_runtime_capability_missing');

  const [kind, precision] = await Promise.all([assetKinds(network, assetId), sidechainPrecision(network, assetId)]);

  if (codecKind(kind) !== expectedKind.toLowerCase() || codecNumber(precision) !== expectedPrecision) {
    throw new Error('cross_chain_runtime_registration_drift');
  }
}

async function assertParachainRegistration(
  api: BridgeRuntimeApi,
  execution:
    | Extract<ReviewedCrossChainExecution, { kind: 'external-to-sora-xcm-v3' }>
    | Extract<ReviewedCrossChainExecution, { kind: 'sora-bridge-proxy-burn-v3' }>
): Promise<void> {
  if (execution.bridgeNetwork === 'Liberland') return;

  const bridge = api.query.parachainBridgeApp;
  if (!bridge) throw new Error('cross_chain_runtime_capability_missing');

  if ('bridgeParachainId' in execution && execution.bridgeParachainId !== undefined) {
    if (!bridge.allowedParachainAssets) throw new Error('cross_chain_runtime_capability_missing');
    const allowed = await bridge.allowedParachainAssets(execution.bridgeNetwork, execution.bridgeParachainId);
    const items = Array.from((allowed as unknown as Iterable<Codec>) ?? []);
    const ids = items.map((item) => codecAssetId(item));

    if (!ids.includes(execution.soraAssetId.toLowerCase())) {
      throw new Error('cross_chain_runtime_registration_drift');
    }
  } else if ('recipientKind' in execution && execution.recipientKind === 'parachain') {
    if (!bridge.allowedParachainAssets) throw new Error('cross_chain_runtime_capability_missing');
    const allowed = await bridge.allowedParachainAssets(execution.bridgeNetwork, execution.destinationParaId);
    const items = Array.from((allowed as unknown as Iterable<Codec>) ?? []);
    const ids = items.map((item) => codecAssetId(item));

    if (!ids.includes(execution.soraAssetId.toLowerCase())) {
      throw new Error('cross_chain_runtime_registration_drift');
    }
  } else {
    if (!bridge.relaychainAsset) throw new Error('cross_chain_runtime_capability_missing');
    const registered = await bridge.relaychainAsset(execution.bridgeNetwork);
    if (codecAssetId(registered) !== execution.soraAssetId.toLowerCase()) {
      throw new Error('cross_chain_runtime_registration_drift');
    }
  }

  await assertAssetKindAndPrecision({
    api,
    pallet: 'parachainBridgeApp',
    network: execution.bridgeNetwork,
    assetId: execution.soraAssetId,
    expectedKind: execution.soraAssetKind,
    expectedPrecision:
      execution.kind === 'external-to-sora-xcm-v3' ? execution.assetPrecision : execution.sidechainPrecision,
  });
}

function matchesExternalAsset(value: Codec, expected: 'LLD' | number): boolean {
  const unwrapped = unwrap(value);
  const encoded = JSON.stringify(unwrapped.toJSON?.() ?? unwrapped.toString())
    .replace(/\s/g, '')
    .toLowerCase();

  if (expected === 'LLD') {
    return ['"lld"', '{"lld":null}'].includes(encoded);
  }

  const id = String(expected);

  return [id, `"${id}"`, `{"asset":${id}}`, `{"asset":"${id}"}`, `"asset(${id})"`].includes(encoded);
}

async function assertLiberlandRegistration(
  soraApi: BridgeRuntimeApi,
  execution:
    | Extract<ReviewedCrossChainExecution, { kind: 'sora-bridge-proxy-burn-v3' }>
    | Extract<ReviewedCrossChainExecution, { kind: 'liberland-to-sora-burn' }>
): Promise<void> {
  const assetId = execution.soraAssetId;

  await assertAssetKindAndPrecision({
    api: soraApi,
    pallet: 'substrateBridgeApp',
    network: 'Liberland',
    assetId,
    expectedKind: execution.soraAssetKind,
    expectedPrecision: execution.sidechainPrecision,
  });

  const sidechainAssetId = soraApi.query.substrateBridgeApp?.sidechainAssetId;
  if (!sidechainAssetId) throw new Error('cross_chain_runtime_capability_missing');

  if (!matchesExternalAsset(await sidechainAssetId('Liberland', assetId), execution.externalAsset)) {
    throw new Error('cross_chain_runtime_registration_drift');
  }
}

async function destinationMinimum(
  minimum: ReviewedDestinationMinimum | undefined,
  state: State,
  destinationApi: BridgeRuntimeApi
): Promise<string> {
  if (!minimum) return '0';

  let codecValue: Codec;

  switch (minimum.kind) {
    case 'balances-existential-deposit': {
      const value = destinationApi.consts?.balances?.existentialDeposit;
      if (!value) throw new Error('cross_chain_runtime_minimum_unavailable');
      codecValue = value;
      break;
    }
    case 'assets-min-balance': {
      const asset = destinationApi.query.assets?.asset;
      if (!asset) throw new Error('cross_chain_runtime_minimum_unavailable');
      const details = unwrap(await asset(minimum.assetId));
      const value = details.minBalance as Codec | undefined;
      if (!value) throw new Error('cross_chain_runtime_minimum_unavailable');
      codecValue = value;
      break;
    }
    case 'acala-token-minimum': {
      const metadata = destinationApi.query.assetRegistry?.assetMetadatas;
      if (!metadata) throw new Error('cross_chain_runtime_minimum_unavailable');
      const details = unwrap(await metadata({ NativeAssetId: { Token: minimum.token } }));
      const value = (details.minimalBalance ?? details.existentialDeposit) as Codec | undefined;
      if (!value) throw new Error('cross_chain_runtime_minimum_unavailable');
      codecValue = value;
      break;
    }
    case 'sora-parachain-asset-minimum': {
      const parachainApi = await runtimeForChain(state, minimum.chainId);
      assertGenesis(parachainApi, minimum.chainId);
      await parachainApi.isReadyOrError;
      const assetIdToMultilocation = parachainApi.query.xcmApp?.assetIdToMultilocation;
      const assetMinimumAmount = parachainApi.query.xcmApp?.assetMinimumAmount;
      if (!assetIdToMultilocation || !assetMinimumAmount) {
        throw new Error('cross_chain_runtime_minimum_unavailable');
      }
      const multilocation = unwrap(await assetIdToMultilocation(minimum.assetId));
      codecValue = unwrap(await assetMinimumAmount(multilocation));
      break;
    }
  }

  return FPNumber.fromCodecValue(codecValue.toString(), minimum.precision).toString();
}

export async function assertReviewedRuntimeAuthority(
  execution: Readonly<ReviewedCrossChainExecution>,
  state: State
): Promise<{ originApi: BridgeRuntimeApi; destinationApi: BridgeRuntimeApi; runtimeMinimum: string }> {
  const [originApi, destinationApi] = await Promise.all([
    runtimeForChain(state, execution.originChainId),
    runtimeForChain(state, execution.destinationChainId),
  ]);

  assertGenesis(originApi, execution.originChainId);
  assertGenesis(destinationApi, execution.destinationChainId);
  await Promise.all([originApi.isReadyOrError, destinationApi.isReadyOrError]);

  if (execution.kind === 'external-to-sora-xcm-v3') {
    await assertParachainRegistration(destinationApi, execution);
  } else if (execution.kind === 'sora-bridge-proxy-burn-v3') {
    if (execution.bridgeNetwork === 'Liberland') await assertLiberlandRegistration(originApi, execution);
    else await assertParachainRegistration(originApi, execution);
  } else if (execution.kind === 'liberland-to-sora-burn') {
    await assertLiberlandRegistration(destinationApi, execution);
  }

  return {
    originApi,
    destinationApi,
    runtimeMinimum: await destinationMinimum(execution.destinationMinimum, state, destinationApi),
  };
}
