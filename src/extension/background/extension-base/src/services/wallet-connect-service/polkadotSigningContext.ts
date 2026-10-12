import { decodeAddress } from '@polkadot/util-crypto';
import { u8aEq } from '@polkadot/util';
import { captureSessionSigningContext } from './sessionSigningContext';
import type { SessionSigningContext } from './sessionSigningContext';
import type { SignClientTypes } from '@walletconnect/types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';
import type State from '@extension-base/background/handlers/State';

type Event = SignClientTypes.EventArguments['session_request'];
export type PolkadotSigningContext = { event: Event; session: SessionSigningContext; origin: string };

function origin(value: string): string {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('WalletConnect requester origin is unavailable');
  return url.origin;
}

export function polkadotSigningPayload(event: Event): SignerPayloadJSON | SignerPayloadRaw {
  const { chainId, request } = event.params;
  if (!/^polkadot:[0-9a-f]{32}$/.test(chainId)) throw new Error('Invalid WalletConnect Polkadot chain');
  const params = request.params;
  if (!params || Array.isArray(params) || typeof params.address !== 'string')
    throw new Error('Invalid WalletConnect Polkadot signing parameters');
  if (request.method === 'polkadot_signMessage') {
    if (typeof params.message !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(params.message))
      throw new Error('Invalid WalletConnect Polkadot message');
    return { address: params.address, data: params.message, type: 'bytes' };
  }
  if (request.method !== 'polkadot_signTransaction') throw new Error('Unsupported WalletConnect Polkadot method');
  const payload = params.transactionPayload as SignerPayloadJSON;
  if (
    !payload ||
    !/^0x[0-9a-fA-F]{64}$/.test(payload.genesisHash) ||
    `polkadot:${payload.genesisHash.slice(2, 34).toLowerCase()}` !== chainId ||
    !u8aEq(decodeAddress(payload.address), decodeAddress(params.address))
  )
    throw new Error('WalletConnect Polkadot payload does not match its chain and account');
  return structuredClone(payload);
}

export function capturePolkadotSigningContext(state: State, event: Event): PolkadotSigningContext {
  if (typeof event.topic !== 'string' || !event.topic || !Number.isSafeInteger(event.id) || event.id < 0)
    throw new Error('Invalid WalletConnect request identity');
  const snapshot = structuredClone(event);
  const payload = polkadotSigningPayload(snapshot);
  const session = captureSessionSigningContext(state.walletConnectService, {
    topic: snapshot.topic,
    chainId: snapshot.params.chainId,
    method: snapshot.params.request.method,
    address: payload.address,
  });
  const requester = origin(session.peer.metadata.url);
  const verified = snapshot.verifyContext?.verified;
  if (
    verified?.isScam ||
    verified?.validation === 'INVALID' ||
    (verified?.validation === 'VALID' && origin(verified.origin) !== requester)
  )
    throw new Error('WalletConnect requester verification does not match the session');
  return { event: snapshot, session, origin: requester };
}

export function validatePolkadotSigningContext(
  state: State,
  context: PolkadotSigningContext,
  payload?: SignerPayloadJSON | SignerPayloadRaw,
  url?: string
): void {
  const current = capturePolkadotSigningContext(state, context.event);
  if (
    JSON.stringify(current) !== JSON.stringify(context) ||
    (payload && JSON.stringify(polkadotSigningPayload(context.event)) !== JSON.stringify(payload)) ||
    (url !== undefined && url !== context.origin)
  )
    throw new Error('WalletConnect Polkadot context changed; request approval again');
}
