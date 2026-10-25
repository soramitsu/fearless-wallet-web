export type IrohaConnectNetwork = 'taira' | 'nexus';

export type IrohaConnectPhase = 'idle' | 'connecting' | 'session-approval' | 'connected' | 'request-approval' | 'error';

export type IrohaConnectAccount = {
  address: string;
  name: string;
  network: IrohaConnectNetwork;
  publicKeyHex: string;
};

export type IrohaConnectSession = {
  appName: string;
  appUrl?: string;
  chainId: string;
  connectedAt?: number;
  network: IrohaConnectNetwork;
  protocol: 'iroha-connect-v1-uranai';
  toriiBaseUrl: string;
};

export type IrohaConnectSigningRequest = {
  accountId: string;
  contractAddress?: string;
  contractAlias?: string;
  createdAt: number;
  entrypoint?: string;
  expiresAt: number;
  requestId: string;
  signingMessageBytes: number;
  signingMessageSha256: string;
};

export type IrohaConnectSnapshot = {
  accounts: IrohaConnectAccount[];
  error?: string;
  phase: IrohaConnectPhase;
  request?: IrohaConnectSigningRequest;
  selectedAccountId?: string;
  session?: IrohaConnectSession;
};

export type IrohaConnectStartRequest = {
  uri: string;
};

export type IrohaConnectAccountRequest = {
  accountId: string;
};

export type IrohaConnectPendingRequest = {
  requestId: string;
};

export const EMPTY_IROHA_CONNECT_SNAPSHOT: IrohaConnectSnapshot = {
  accounts: [],
  phase: 'idle',
};
