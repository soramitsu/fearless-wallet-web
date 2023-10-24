import {
  RequestConnectWalletConnect,
  WalletConnectSessionRequest,
  WalletConnectSessions,
  RequestApproveConnectWalletSession,
  RequestRejectConnectWalletSession,
  WalletConnectNotSupportRequest,
  RequestApproveWalletConnectNotSupport,
  RequestRejectWalletConnectNotSupport,
  WalletConnectTransactionRequest,
} from '../background/extension-base/src/services/wallet-connect-service/types';
import { NotificationResponse } from '../background/extension-base/src/background/types/types';
import { sendMessage } from '.';

export function newConnection(request: RequestConnectWalletConnect): Promise<boolean> {
  return sendMessage('pri(walletConnect.connect)', request);
}

export function walletConnectRequestSubscribe(
  callback: (data: WalletConnectSessionRequest[]) => void
): Promise<WalletConnectSessionRequest[]> {
  return sendMessage('pri(walletConnect.requests.connect.subscribe)', null, callback);
}

export function walletConnectSessionsSubscribe(
  callback: (data: WalletConnectSessions) => void
): Promise<WalletConnectSessions> {
  return sendMessage('pri(walletConnect.session.subscribe)', null, callback);
}

export function approveWalletConnectSession(
  request: RequestApproveConnectWalletSession
): Promise<NotificationResponse> {
  return sendMessage('pri(walletConnect.session.approve)', request);
}

export function rejectWalletConnectSession(request: RequestRejectConnectWalletSession): Promise<boolean> {
  return sendMessage('pri(walletConnect.session.reject)', request);
}

export function disconnectWalletConnectConnection(topic: string): Promise<boolean> {
  return sendMessage('pri(walletConnect.session.disconnect)', { topic });
}

export function subscribeWalletNotSupportedConnectRequest(
  cb: (data: WalletConnectNotSupportRequest[]) => void
): Promise<WalletConnectNotSupportRequest[]> {
  return sendMessage('pri(walletConnect.requests.notSupport.subscribe)', null, cb);
}

export function approveWalletConnectNotSupport(request: RequestApproveWalletConnectNotSupport): Promise<boolean> {
  return sendMessage('pri(walletConnect.notSupport.approve)', request);
}

export function rejectWalletConnectNotSupport(request: RequestRejectWalletConnectNotSupport): Promise<boolean> {
  return sendMessage('pri(walletConnect.notSupport.reject)', request);
}

export function subscribeWalletConnectRequest(
  cb: (data: WalletConnectTransactionRequest[]) => void
): Promise<WalletConnectTransactionRequest[]> {
  return sendMessage('pri(walletConnect.signing.requests.subscribe)', null, cb);
}

export function walletConnectRequestApprove(
  address: string,
  password: string,
  topic: string,
  isSavePass: boolean
): Promise<boolean> {
  return sendMessage('pri(walletConnect.request.approve)', { address, password, topic, isSavePass });
}

export function walletConnectRequestReject(topic: string): Promise<boolean> {
  return sendMessage('pri(walletConnect.request.reject)', { topic });
}
