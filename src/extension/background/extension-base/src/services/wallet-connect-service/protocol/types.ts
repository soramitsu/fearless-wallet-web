// The records and messages of the WalletConnect v2 Sign protocol, as peers exchange them. Field names follow the
// protocol because dApps and wallets read them on the other end.

import type { JsonRpcResponse } from '@extension-base/utils/jsonRpc';

export type WcMetadata = {
  name: string;
  description: string;
  url: string;
  icons: string[];
  verifyUrl?: string;
  redirect?: { native?: string; universal?: string; linkMode?: boolean };
};

export type WcRelay = { protocol: string; data?: string };

/** What a proposal asks for in one namespace (or one chain, when the key is a chain id). */
export type WcProposalNamespace = { chains?: string[]; methods: string[]; events: string[] };
export type WcProposalNamespaces = Record<string, WcProposalNamespace>;

/** What a session grants in one namespace: the accounts are CAIP-10 ids, `namespace:reference:address`. */
export type WcSessionNamespace = { chains?: string[]; accounts: string[]; methods: string[]; events: string[] };
export type WcSessionNamespaces = Record<string, WcSessionNamespace>;

export type WcParticipant = { publicKey: string; metadata: WcMetadata };

export type WcProposal = {
  id: number;
  /** Seconds. */
  expiryTimestamp: number;
  /** Seconds; the name older peers used. */
  expiry?: number;
  relays: WcRelay[];
  proposer: WcParticipant;
  requiredNamespaces: WcProposalNamespaces;
  optionalNamespaces: WcProposalNamespaces;
  sessionProperties?: Record<string, string>;
  scopedProperties?: Record<string, unknown>;
  pairingTopic: string;
};

export type WcSession = {
  topic: string;
  pairingTopic: string;
  relay: WcRelay;
  /** Seconds. */
  expiry: number;
  /** Whether the peer confirmed the settlement. Requests are refused before. */
  acknowledged: boolean;
  /** The public key of the wallet side. When it is `self.publicKey`, Fearless is the wallet in this session. */
  controller: string;
  namespaces: WcSessionNamespaces;
  requiredNamespaces: WcProposalNamespaces;
  optionalNamespaces: WcProposalNamespaces;
  sessionProperties?: Record<string, string>;
  scopedProperties?: Record<string, unknown>;
  self: WcParticipant;
  peer: WcParticipant;
  transportType?: 'relay';
};

export type WcPairing = {
  topic: string;
  /** Seconds. */
  expiry: number;
  relay: WcRelay;
  /** A pairing turns active once a session came out of it. */
  active: boolean;
  peerMetadata?: WcMetadata;
  methods?: string[];
};

export type WcValidation = 'UNKNOWN' | 'VALID' | 'INVALID';

/** Where the Verify service says a proposal or request came from, against the URL the peer claims. */
export type WcVerifyContext = {
  verified: { origin: string; validation: WcValidation; verifyUrl: string; isScam?: boolean };
};

/* eslint-disable @typescript-eslint/no-explicit-any -- method parameters are defined by each chain's methods */
export type WcRequest = { method: string; params: any; expiryTimestamp?: number };
/* eslint-enable @typescript-eslint/no-explicit-any */

export type WcSessionRequestParams = { request: WcRequest; chainId: string };

export type WcSessionProposalEvent = { id: number; params: WcProposal; verifyContext: WcVerifyContext };
export type WcSessionRequestEvent = {
  id: number;
  topic: string;
  params: WcSessionRequestParams;
  verifyContext: WcVerifyContext;
};

export type WcEvents = {
  session_proposal: WcSessionProposalEvent;
  session_request: WcSessionRequestEvent;
  session_request_expire: { id: number; topic: string };
  session_delete: { id: number; topic: string };
  session_expire: { topic: string };
  session_ping: { id: number; topic: string };
  session_event: { id: number; topic: string; params: { event: { name: string; data: unknown }; chainId: string } };
  session_update: { id: number; topic: string; params: { namespaces: WcSessionNamespaces } };
  session_extend: { id: number; topic: string };
  proposal_expire: { id: number };
};

export type WcEvent = keyof WcEvents;

export type WcErrorReason = { code: number; message: string };

export type WcApproveParams = {
  id: number;
  namespaces: WcSessionNamespaces;
  relayProtocol?: string;
  sessionProperties?: Record<string, string>;
};

export type WcRejectParams = { id: number; reason: WcErrorReason };

export type WcRespondParams = { topic: string; response: JsonRpcResponse };

export type WcRequestParams = {
  topic: string;
  chainId: string;
  request: { method: string; params: unknown };
  /** Seconds the peer has to answer; 5 minutes to 7 days, 15 minutes by default. */
  expiry?: number;
};

export type WcConnectParams = {
  requiredNamespaces?: WcProposalNamespaces;
  optionalNamespaces?: WcProposalNamespaces;
  sessionProperties?: Record<string, string>;
};

export type WcDisconnectParams = { topic: string; reason: WcErrorReason };

export type WcConnectResult = { uri: string; approval: () => Promise<WcSession> };

export type WcApproveResult = { topic: string; acknowledged: () => Promise<WcSession> };
