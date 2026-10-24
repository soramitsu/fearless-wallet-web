import { sendMessage } from '.';
import type {
  IrohaConnectAccountRequest,
  IrohaConnectPendingRequest,
  IrohaConnectSnapshot,
  IrohaConnectStartRequest,
} from '@extension-base/services/iroha-connect-service/types';

export function connectIrohaConnect(request: IrohaConnectStartRequest): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.connect)', request);
}

export function subscribeIrohaConnect(
  callback: (snapshot: IrohaConnectSnapshot) => void
): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.subscribe)', null, callback);
}

export function approveIrohaConnectSession(request: IrohaConnectAccountRequest): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.session.approve)', request);
}

export function rejectIrohaConnectSession(): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.session.reject)');
}

export function approveIrohaConnectRequest(request: IrohaConnectPendingRequest): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.request.approve)', request);
}

export function rejectIrohaConnectRequest(request: IrohaConnectPendingRequest): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.request.reject)', request);
}

export function disconnectIrohaConnect(): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.disconnect)');
}

export function clearIrohaConnectError(): Promise<IrohaConnectSnapshot> {
  return sendMessage('pri(irohaConnect.error.clear)');
}
