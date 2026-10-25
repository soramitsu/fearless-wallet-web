import { type EvmRequests, type SolanaRequests } from '@extension-base/services/request-service/types';
import type {
  SigningRequest,
  ResponseAuthorizeList,
  AuthorizeRequest,
  MetadataRequest,
  AuthType,
} from '@extension-base/background/types/types';
import type { HexString } from '@polkadot/util/types';
import type { SigningRequestKind } from '@extension-base/services/request-service/signingRequestId';
import { sendMessage } from '@/extension/messaging/index';

export function approveAuthRequest(id: string, authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve)', { id, authorizedAccounts });
}

export function updateAuthorization(authorizedAccounts: string[], url: string, authType: AuthType): Promise<void> {
  return sendMessage('pri(authorize.update)', { authorizedAccounts, url, authType });
}

export function deleteAuthRequest(requestId: string): Promise<void> {
  return sendMessage('pri(authorize.delete.request)', requestId);
}

export function getAuthList(): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.list)');
}

export function removeAuthorization(url: string): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.remove)', url);
}

export function cancelAuthRequest(requestId: string): Promise<boolean> {
  return sendMessage('pri(authorize.cancel)', requestId);
}

export function subscribeAuthorizeRequests(cb: (requests: AuthorizeRequest[]) => void): Promise<AuthorizeRequest[]> {
  return sendMessage('pri(authorize.requests)', null, cb);
}

// Each names the queue of the request on screen, so the background acts on that request and no other.
export function cancelSignRequest(id: string, kind: SigningRequestKind): Promise<boolean> {
  return sendMessage('pri(signing.cancel)', { id, kind });
}

export function approveSign(id: string, kind: SigningRequestKind): Promise<boolean> {
  return sendMessage('pri(signing.approve)', { id, kind });
}

export function approveSignSignature(id: string, signature: HexString, kind: SigningRequestKind): Promise<boolean> {
  return sendMessage('pri(signing.approve.signature)', { id, signature, kind });
}

export function subscribeSigningRequests(cb: (accounts: SigningRequest[]) => void): Promise<SigningRequest[]> {
  return sendMessage('pri(signing.requests)', null, cb);
}

export function subscribeEvmSigningRequests(cb: (requests: EvmRequests) => void): Promise<EvmRequests> {
  return sendMessage('pri(signing.evmRequests)', null, cb);
}

export function subscribeSolanaSigningRequests(cb: (requests: SolanaRequests) => void): Promise<SolanaRequests> {
  return sendMessage('pri(signing.solanaRequests)', null, cb);
}

export function approveMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.approve)', { id });
}

export function rejectMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.reject)', { id });
}

export function subscribeMetadataRequests(cb: (accounts: MetadataRequest[]) => void): Promise<MetadataRequest[]> {
  return sendMessage('pri(metadata.requests)', null, cb);
}
