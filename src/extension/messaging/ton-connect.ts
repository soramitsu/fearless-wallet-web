import type { TonRequests } from '@extension-base/services/request-service/types';
import type { TonConnectApprovalRequest, TonConnectSessionView } from '@extension-base/services/ton-connect-service';
import { sendMessage } from '@/extension/messaging/index';

export function subscribeTonSigningRequests(cb: (requests: TonRequests) => void): Promise<TonRequests> {
  return sendMessage('pri(signing.tonRequests)', null, cb);
}

export function subscribeTonConnectRequests(
  cb: (requests: TonConnectApprovalRequest[]) => void
): Promise<TonConnectApprovalRequest[]> {
  return sendMessage('pri(tonConnect.requests)', null, cb);
}

export function approveTonConnectRequest(id: string, address: string): Promise<boolean> {
  return sendMessage('pri(tonConnect.approve)', { id, address });
}

export function rejectTonConnectRequest(id: string): Promise<boolean> {
  return sendMessage('pri(tonConnect.reject)', { id });
}

export function subscribeTonConnectSessions(
  cb: (sessions: TonConnectSessionView[]) => void
): Promise<TonConnectSessionView[]> {
  return sendMessage('pri(tonConnect.sessions)', null, cb);
}

export function disconnectTonConnectSession(origin: string): Promise<TonConnectSessionView[]> {
  return sendMessage('pri(tonConnect.disconnect)', { origin });
}
