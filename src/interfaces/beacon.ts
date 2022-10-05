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
} from '@airgap/beacon-sdk';
import { BlockchainMessage } from '@airgap/beacon-types';
import type { SignerPayloadJSON, SignerPayloadRaw } from '@polkadot/types/types';

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

export interface SubstrateSignPayloadRequest extends BlockchainRequestV3<string> {
  blockchainData: {
    type: SubstrateMessageType.sign_payload_request;
    scope: SubstratePermissionScope.sign_payload_json;
    payload: SignerPayloadJSON;
    mode: 'submit' | 'submit-and-return' | 'return';
  };
}
