import type {
  SigningRequest,
  ResponseSigningIsLocked,
  ResponseAuthorizeList,
  AuthorizeRequest,
  MetadataRequest,
} from '@extension-base/background/types/types';
import type { HexString } from '@polkadot/util/types';
import { sendMessage } from '@/extension/messaging/index';
import { type ConfirmationsEvmQueue } from '@/extension/background/extension-base/src/services/wallet-connect-service/types';

export function approveAuthRequest(id: string, authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve)', { id, authorizedAccounts });
}

export function approvePolkaswapAuthRequest(authorizedAccounts: string[]) {
  return sendMessage('pri(authorize.approve.polkaswap)', authorizedAccounts);
}

export function updateAuthorization(authorizedAccounts: string[], url: string): Promise<void> {
  return sendMessage('pri(authorize.update)', { authorizedAccounts, url });
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

export function subscribeAuthorizeRequests(cb: (requests: AuthorizeRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(authorize.requests)', null, cb);
}

export function cancelSignRequest(id: string): Promise<boolean> {
  return sendMessage('pri(signing.cancel)', { id });
}

export function approveSignPassword(id: string, savePass: boolean, password?: string): Promise<boolean> {
  return sendMessage('pri(signing.approve.password)', { id, password, savePass });
}

export function isSignLocked(address: string): Promise<ResponseSigningIsLocked> {
  return sendMessage('pri(signing.isLocked)', { address });
}

export function approveSignSignature(id: string, signature: HexString): Promise<boolean> {
  return sendMessage('pri(signing.approve.signature)', { id, signature });
}

export function subscribeSigningRequests(cb: (accounts: SigningRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(signing.requests)', null, cb);
}

export function subscribeEvmSigningRequests(cb: (requests: ConfirmationsEvmQueue) => void): Promise<boolean> {
  return sendMessage('pri(signing.evmrequests)', null, cb);
}

export function approveMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.approve)', { id });
}

export function rejectMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.reject)', { id });
}

export function subscribeMetadataRequests(cb: (accounts: MetadataRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(metadata.requests)', null, cb);
}
