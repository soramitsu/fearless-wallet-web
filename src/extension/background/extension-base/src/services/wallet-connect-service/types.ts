import { SignerPayloadJSON } from '@polkadot/types/types';
import { EngineTypes, SignClientTypes, SessionTypes } from '@walletconnect/types';
import { EvmSendTransactionParams } from '../../api/evm/types/ether';
import { Resolver } from '../../types';
//TODO refactoring types
type BaseWalletConnectSessionRequest = {
  id: string;
  isInternal?: boolean;
  url: string;
};
export interface WalletConnectSessionRequest extends BaseWalletConnectSessionRequest {
  request: SignClientTypes.EventArguments['session_proposal'];
  isPasswordRequired?: boolean;
}

export type WalletConnectSessions = SessionTypes.Struct[] | null;

export interface WalletConnectNotSupportRequest extends BaseWalletConnectSessionRequest {
  request: SignClientTypes.EventArguments['session_request'];
}
export interface WalletConnectTransactionRequest extends BaseWalletConnectSessionRequest {
  request: SignClientTypes.EventArguments['session_request'];
}
export interface RequestApproveWalletConnect {
  address: string;
  password: string;
  topic: string;
}

export interface RequestRejectConnectWalletSession {
  id: string;
}

export interface RequestApproveConnectWalletSession {
  id: string;
  accounts: string[];
}

export interface RequestReconnectConnectWalletSession {
  id: string;
}

export interface RequestDisconnectWalletConnectSession {
  topic: string;
}

// Not support

export interface RequestRejectWalletConnectNotSupport {
  id: string;
}

export interface RequestApproveWalletConnectNotSupport {
  id: string;
}
export type ResultApproveWalletConnectSession = EngineTypes.ApproveParams;
export interface RequestWalletConnectSession extends WalletConnectSessionRequest, Resolver<void> {}
export interface RequestWalletConnectNotSupport extends WalletConnectNotSupportRequest, Resolver<void> {}

export interface RequestConnectWalletConnect {
  uri: string;
}
export enum EIP155_SIGNING_METHODS {
  PERSONAL_SIGN = 'personal_sign',
  ETH_SIGN = 'eth_sign',
  ETH_SIGN_TRANSACTION = 'eth_signTransaction',
  ETH_SIGN_TYPED_DATA = 'eth_signTypedData',
  ETH_SIGN_TYPED_DATA_V1 = 'eth_signTypedData_v1',
  ETH_SIGN_TYPED_DATA_V3 = 'eth_signTypedData_v3',
  ETH_SIGN_TYPED_DATA_V4 = 'eth_signTypedData_v4',
  ETH_SEND_RAW_TRANSACTION = 'eth_sendRawTransaction',
  ETH_SEND_TRANSACTION = 'eth_sendTransaction',
}

export enum POLKADOT_SIGNING_METHODS {
  POLKADOT_SIGN_TRANSACTION = 'polkadot_signTransaction',
  POLKADOT_SIGN_MESSAGE = 'polkadot_signMessage',
}

export type WalletConnectSigningMethod = EIP155_SIGNING_METHODS | POLKADOT_SIGNING_METHODS;

export interface WalletConnectPolkadotSignMessageParams {
  address: string;
  message: string;
}

export interface WalletConnectPolkadotSignTransactionParams {
  address: string;
  transactionPayload: SignerPayloadJSON;
}

export type WalletConnectEip155SignMessage = [string, string]; // payload and address
export type WalletConnectEip155SendTransaction = [EvmSendTransactionParams];

export type WalletConnectParamMap = {
  [POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_MESSAGE]: WalletConnectPolkadotSignMessageParams;
  [POLKADOT_SIGNING_METHODS.POLKADOT_SIGN_TRANSACTION]: WalletConnectPolkadotSignTransactionParams;
  [EIP155_SIGNING_METHODS.PERSONAL_SIGN]: WalletConnectEip155SignMessage;
  [EIP155_SIGNING_METHODS.ETH_SIGN]: WalletConnectEip155SignMessage;
  [EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA]: WalletConnectEip155SignMessage;
  [EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V3]: WalletConnectEip155SignMessage;
  [EIP155_SIGNING_METHODS.ETH_SIGN_TYPED_DATA_V4]: WalletConnectEip155SignMessage;
  [EIP155_SIGNING_METHODS.ETH_SEND_TRANSACTION]: WalletConnectEip155SendTransaction;
};
