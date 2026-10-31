import { TypeRegistry } from '@polkadot/types';
import { findUnknownExtensions } from '@polkadot/types/extrinsic/signedExtensions';
import {
  assertNoRetiredCrossChainDestination,
  reviewSubstrateCall,
  sameSubstrateCallReview,
  type SubstrateCallReview,
} from './substrateCallReview';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type { HexString } from '@polkadot/util/types';
import type State from '@extension-base/background/handlers/State';
import type { SignRequest } from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services/request-service';

export type SubstrateNetworkSnapshot = { genesisHash: string; name?: string };
export type SubstrateSigningContext =
  | { kind: 'raw' }
  | {
      kind: 'extrinsic';
      network: SubstrateNetworkSnapshot;
      catalog: { name: string; genesisHash: string; ecosystem: string } | null;
      metadata: MetadataDef | null;
      /** The call as the wallet's own runtime decodes it, with every cross-chain transfer in it. */
      callReview: SubstrateCallReview;
    };

export function captureSubstrateSigningContext(
  state: State,
  service: RequestService,
  payload: SignerPayloadJSON | SignerPayloadRaw
): SubstrateSigningContext {
  if ('data' in payload) {
    if (
      payload.type !== 'bytes' ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(payload.data) ||
      ['genesisHash', 'method', 'version', 'signedExtensions'].some((key) => key in payload)
    )
      throw new Error('Unsupported or ambiguous Substrate raw signing payload');
    return { kind: 'raw' };
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(payload.genesisHash) || payload.version !== 4)
    throw new Error('Unsupported Substrate signing network or extrinsic version');
  const genesisHash = payload.genesisHash.toLowerCase();
  const matches = Object.values(state.networkService.networkMap).filter(
    (network) => network.genesisHash.toLowerCase() === genesisHash
  );
  if (matches.length > 1) throw new Error('Substrate signing network is ambiguous');
  const network = matches[0];
  if (network && (network.disabled || !['substrate', 'ethereumBased'].includes(network.ecosystem)))
    throw new Error('Substrate signing network is unavailable');
  // Metadata kept before genesis hashes were lower-cased can repeat a chain in another letter case. Copies that agree
  // are one definition; copies that differ stay ambiguous.
  const definitions = service.knownMetadata
    .filter((entry) => entry.genesisHash.toLowerCase() === genesisHash)
    .map((entry) => ({ ...entry, genesisHash: genesisHash as HexString }));
  const metadata = definitions[0];
  if (definitions.slice(1).some((entry) => JSON.stringify(entry) !== JSON.stringify(metadata)))
    throw new Error('Substrate signing metadata is ambiguous');
  if (
    !Array.isArray(payload.signedExtensions) ||
    payload.signedExtensions.some((name) => typeof name !== 'string') ||
    new Set(payload.signedExtensions).size !== payload.signedExtensions.length ||
    findUnknownExtensions(payload.signedExtensions, metadata?.userExtensions).length
  )
    throw new Error('Unknown or ambiguous Substrate signed extensions');
  // Cached metadata is not live-runtime evidence. Custom byte definitions must
  // at least name the requested runtime version; otherwise request fresh metadata.
  if (metadata && (Object.keys(metadata.types).length || Object.keys(metadata.userExtensions ?? {}).length)) {
    if (BigInt(payload.specVersion) !== BigInt(metadata.specVersion))
      throw new Error('Substrate signing metadata requires a runtime version refresh');
  }
  const context: SubstrateSigningContext = structuredClone({
    kind: 'extrinsic',
    network: { genesisHash, ...(network || metadata ? { name: network?.name ?? metadata?.chain } : {}) },
    catalog: network ? { name: network.name, genesisHash, ecosystem: network.ecosystem } : null,
    metadata: metadata ?? null,
    callReview: reviewSubstrateCall(state, network, payload),
  });
  // Fail unsupported codecs at admission, before presenting a signable request.
  createSubstrateSigningRegistry(context, payload).createType('ExtrinsicPayload', payload, {
    version: payload.version,
  });
  return context;
}

function sameSigningContext(current: SubstrateSigningContext, admitted: SubstrateSigningContext): boolean {
  if (current.kind !== 'extrinsic' || admitted.kind !== 'extrinsic') return JSON.stringify(current) === JSON.stringify(admitted);
  const { callReview: currentCall, ...currentRest } = current;
  const { callReview: admittedCall, ...admittedRest } = admitted;

  return JSON.stringify(currentRest) === JSON.stringify(admittedRest) && sameSubstrateCallReview(admittedCall, currentCall);
}

/**
 * Re-derives the context at approval. A call that sends funds to a destination the wallet knows cannot deliver is
 * refused whatever was shown at admission; any other difference asks for a new request.
 */
export function validateSubstrateSigningContext(
  state: State,
  request: Pick<SignRequest, 'request' | 'signingContext'>
): void {
  const current = captureSubstrateSigningContext(state, state.requestService, request.request.payload);
  if (current.kind === 'extrinsic') assertNoRetiredCrossChainDestination(current.callReview);
  if (!request.signingContext || !sameSigningContext(current, request.signingContext))
    throw new Error('Substrate signing context changed; request approval again');
}

export function createSubstrateSigningRegistry(
  context: SubstrateSigningContext | undefined,
  payload: SignerPayloadJSON | SignerPayloadRaw
): TypeRegistry {
  if (!context) throw new Error('Substrate signing context is missing');
  if (context.kind === 'raw' && !('data' in payload))
    throw new Error('Substrate signing payload does not match its context');
  const registry = new TypeRegistry();
  if (context.kind === 'extrinsic') {
    if (!('genesisHash' in payload)) throw new Error('Substrate signing payload does not match its context');
    registry.setSignedExtensions(payload.signedExtensions, structuredClone(context.metadata?.userExtensions));
    if (context.metadata) registry.register(structuredClone(context.metadata.types));
  }
  return registry;
}
