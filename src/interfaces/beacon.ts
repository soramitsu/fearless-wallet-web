import {
  PermissionRequestV3,
  SubstratePermissionScope,
  AppMetadata,
  WalletInfo,
  PermissionResponseOutput,
  BlockExplorer,
  AccountInfo,
  ConnectionContext,
  SignPayloadResponse,
  BlockchainRequestV3,
  SubstrateMessageType,
  ErrorResponse,
  BlockchainResponseV3,
  PermissionEntity,
  PermissionScope,
} from '@airgap/beacon-sdk';
import type { HexString } from '@polkadot/util/types';

export interface PermissionErrorPayload {
  errorResponse: ErrorResponse;
  walletInfo: WalletInfo;
}

interface GenesisHash {
  genesisHash: HexString;
}

type BeaconNetworksWhiteList = {
  genesisHash: HexString; // Wallet shows only those accounts
  rpc?: string; // For development nodes?
}[];

export interface SubstratePermissionRequest extends PermissionRequestV3<'substrate'> {
  blockchainData: {
    scopes: SubstratePermissionScope[]; // enum
    appMetadata: AppMetadata;
    networks?: BeaconNetworksWhiteList; // Array to "whitelist" certain networks? (optional)
  };
}

export interface ExtraInfo {
  resetCallback?(): Promise<void>;
}

export interface RequestSentInfo {
  extraInfo: ExtraInfo;
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

export interface SubstrateSignPayloadRequest extends BlockchainRequestV3<'substrate'> {
  blockchainData: {
    type: SubstrateMessageType.sign_payload_request;
    scope: SubstratePermissionScope.sign_payload_json;
    payload: PayloadJSON;
    mode: 'return';
  };
}

export interface SignerPayloadRaw {
  isMutable: boolean;
  data: string;
  dataType: string;
  type: string;
  address: string;
}

export interface SubstrateSignPayloadRequestRaw extends BlockchainRequestV3<'substrate'> {
  blockchainData: {
    type: SubstrateMessageType.sign_payload_request;
    scope: SubstratePermissionScope.sign_payload_raw;
    payload: SignerPayloadRaw;
    mode: 'submit' | 'submit-and-return' | 'return';
  };
}

export interface TransferPayload {
  amount: string;
  network: GenesisHash;
  recipient: string;
  sourceAddress: string;
}

export interface SubstrateSignPayloadResponse extends BlockchainResponseV3<'substrate'> {
  blockchainData: {
    signature: HexString;
    payload?: string;
  };
}

export interface SubstrateSignPayloadJSONResponse extends BlockchainResponseV3<'substrate'> {
  blockchainData: {
    signature: HexString;
    type: string;
  };
}

interface BeaconAccount {
  accountId: string;
  address: string;
  network: GenesisHash;
  publicKey: string;
}

export interface BeaconAccountInfo extends AccountInfo {
  chainData: {
    accounts: BeaconAccount[];
  };
}

export interface PermissionResponsePayload extends PermissionEntity {
  accountIdentifier: string;
  address: string;
  chainData: {
    accounts: BeaconAccount[];
    appMetadata: AppMetadata;
    scopes: PermissionScope[];
  };
  connectedAt: number;
  origin: {
    type: string;
    id: string;
  };
  publicKey: string;
  scopes: PermissionScope[];
  senderId: string;
}

export interface PermissionSuccess {
  account: PermissionResponsePayload;
  output: PermissionResponseOutput;
  blockExplorer: BlockExplorer;
  connectionContext: ConnectionContext;
  walletInfo: WalletInfo;
}
