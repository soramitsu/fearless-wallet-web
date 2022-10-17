import {
  PermissionRequestV3,
  SubstratePermissionScope,
  AppMetadata,
  WalletInfo,
  AccountInfo,
  PermissionResponseOutput,
  BlockExplorer,
  ConnectionContext,
  SignPayloadResponse,
  BlockchainRequestV3,
  SubstrateMessageType,
  ErrorResponse,
  BlockchainResponseV3,
} from '@airgap/beacon-sdk';
import type { HexString } from '@polkadot/util/types';

export interface PermissionErrorPayload {
  errorResponse: ErrorResponse;
  walletInfo: WalletInfo;
}

export interface SubstratePermissionRequest extends PermissionRequestV3<'substrate'> {
  blockchainData: {
    scopes: SubstratePermissionScope[]; // enum
    appMetadata: AppMetadata;
    networks?: {
      genesisHash: string; // Wallet shows only those accounts
      rpc?: string; // For development nodes?
    }[]; // Array to "whitelist" certain networks? (optional)
  };
}

export interface ExtraInfo {
  resetCallback?(): Promise<void>;
}

export interface RequestSentInfo {
  extraInfo: ExtraInfo;
  walletInfo: WalletInfo;
}

export interface PermissionSuccess {
  account: AccountInfo;
  output: PermissionResponseOutput;
  blockExplorer: BlockExplorer;
  connectionContext: ConnectionContext;
  walletInfo: WalletInfo;
}

export interface SignResponse {
  output: SignPayloadResponse;
  connectionContext: ConnectionContext;
  walletInfo: WalletInfo;
}

export interface SignerPayloadJSON {
  address?: string;
  blockHash: string;
  blockNumber: string;
  era: string;
  genesisHash: string;
  method: string;
  nonce: string;
  specVersion: string;
  tip: string;
  transactionVersion: string;
  signedExtensions: string[];
  version: number;
}
export interface PayloadJSON extends SignerPayloadJSON {
  type: 'json';
}
export type BeaconPayloadJSON = Omit<PayloadJSON, 'address'>;
export interface SubstrateSignPayloadRequest extends BlockchainRequestV3<'substrate'> {
  blockchainData: {
    type: SubstrateMessageType.sign_payload_request;
    scope: SubstratePermissionScope.sign_payload_json;
    payload: BeaconPayloadJSON;
    mode: 'submit' | 'submit-and-return' | 'return';
  };
}
export interface TransferPayload {
  amount: string;
  network: {
    genesisHash: string;
  };
  recipient: string;
  sourceAddress: string;
}

export interface SubstrateTransferRequest extends BlockchainRequestV3<'substrate'> {
  blockchainData: {
    type: SubstrateMessageType.transfer_request;
    scope: SubstratePermissionScope.transfer;
    sourceAddress: string;
    amount: string;
    recipient: string;
    network: {
      genesisHash: string;
      rpc?: string;
    };
    mode: 'submit' | 'submit-and-return' | 'return';
  };
}

export interface SubstrateSignPayloadResponse extends BlockchainResponseV3<'substrate'> {
  blockchainData: {
    signature: HexString;
    payload?: string;
  };
}

export type TCallback<T> = (payload: T) => void;
