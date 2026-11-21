import type { IrohaConnectTransactionReview } from './transactionReview';

export type {
  IrohaConnectReviewAsset,
  IrohaConnectReviewContractCall,
  IrohaConnectReviewFee,
  IrohaConnectReviewFeeLimit,
  IrohaConnectTransactionReview,
} from './transactionReview';

export type IrohaConnectNetwork = 'taira' | 'nexus';

export type IrohaConnectPhase = 'idle' | 'connecting' | 'session-approval' | 'connected' | 'request-approval' | 'error';

export type IrohaConnectAccount = {
  address: string;
  name: string;
  network: IrohaConnectNetwork;
  publicKeyHex: string;
};

export type IrohaConnectSessionPermissions = {
  methods: string[];
  events: string[];
  resources: string[] | null;
};

export type IrohaConnectSession = {
  appName: string;
  appUrl?: string;
  chainId: string;
  connectedAt?: number;
  network: IrohaConnectNetwork;
  networkId: string;
  /** What the dApp asked to use, or null when its Open frame declared no restriction. */
  permissions: IrohaConnectSessionPermissions | null;
  protocol: 'iroha-connect-v1';
  toriiBaseUrl: string;
};

export type IrohaConnectSigningRequest = {
  accountId: string;
  createdAt: number;
  expiresAt: number;
  kind: 'transaction';
  requestId: string;
  review: IrohaConnectTransactionReview;
};

/** Why the wallet answered a dApp request on its own, without asking. */
export type IrohaConnectNoticeCode =
  | 'raw_signing_unavailable'
  | 'transaction_unsupported'
  | 'transaction_invalid'
  | 'transaction_wrong_account'
  | 'permission_denied'
  | 'request_in_progress'
  | 'request_expired'
  | 'dapp_closed';

export type IrohaConnectNotice = {
  at: number;
  code: IrohaConnectNoticeCode;
};

export type IrohaConnectSnapshot = {
  accounts: IrohaConnectAccount[];
  error?: string;
  notice?: IrohaConnectNotice;
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
