// A WalletConnect v2 Sign client for both roles Fearless plays: the wallet that dApps pair with, and the dApp that
// pairs with a phone wallet (mobile accounts). One client, one relay connection and one record serve both, so neither
// role can answer or overwrite the other's sessions. A session in which Fearless is the controller is a wallet session.

import {
  formatJsonRpcError,
  formatJsonRpcRequest,
  formatJsonRpcResult,
  isJsonRpcError,
  isJsonRpcRequest,
  isJsonRpcResponse,
  payloadId,
  type JsonRpcPayload,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '@extension-base/utils/jsonRpc';
import { decrypt, deriveSymKey, encrypt, fromHexKey, generateKeyPair, hashMessage, isHexKey, randomKey, relayAuthToken, topicOf } from './crypto';
import { getInternalError, getSdkError } from './errors';
import { RelayConnection, type RelayMessage, type RelaySocketFactory } from './relay';
import { WalletConnectStore, type KeyValueStorage, type SentProposal, type WalletConnectRecord } from './store';
import { formatPairingUri, parsePairingUri } from './uri';
import {
  coversRequired,
  isChainId,
  isObject,
  readParticipant,
  readProperties,
  readProposalNamespaces,
  readRelay,
  readSessionNamespaces,
} from './validation';
import { VerifyClient, type FetchLike } from './verify';
import type {
  WcApproveParams,
  WcApproveResult,
  WcConnectParams,
  WcConnectResult,
  WcDisconnectParams,
  WcErrorReason,
  WcEvent,
  WcEvents,
  WcMetadata,
  WcPairing,
  WcProposal,
  WcRejectParams,
  WcRequest,
  WcRequestParams,
  WcRespondParams,
  WcSession,
} from './types';

const FIVE_MINUTES = 300;
const FIFTEEN_MINUTES = 900;
const ONE_DAY = 86_400;
const SEVEN_DAYS = 7 * ONE_DAY;
const THIRTY_DAYS = 30 * ONE_DAY;
const MAX_PENDING_PROPOSALS = 20;
const MAX_PENDING_REQUESTS = 200;
const MAX_SEEN = 1000;
const MAX_SWEEP_DELAY_MS = 60 * 60 * 1000;

type PublishOptions = { ttl: number; tag: number; prompt?: boolean };

/** Each method's relay lifetime and tag, which the relay and peers' push services read. */
const RPC = {
  wc_sessionPropose: {
    req: { ttl: FIVE_MINUTES, tag: 1100, prompt: true },
    res: { ttl: FIVE_MINUTES, tag: 1101 },
    reject: { ttl: FIVE_MINUTES, tag: 1120 },
  },
  wc_sessionSettle: { req: { ttl: FIVE_MINUTES, tag: 1102 }, res: { ttl: FIVE_MINUTES, tag: 1103 } },
  wc_sessionUpdate: { req: { ttl: ONE_DAY, tag: 1104 }, res: { ttl: ONE_DAY, tag: 1105 } },
  wc_sessionExtend: { req: { ttl: ONE_DAY, tag: 1106 }, res: { ttl: ONE_DAY, tag: 1107 } },
  wc_sessionRequest: { req: { ttl: FIFTEEN_MINUTES, tag: 1108, prompt: true }, res: { ttl: FIFTEEN_MINUTES, tag: 1109 } },
  wc_sessionEvent: { req: { ttl: FIVE_MINUTES, tag: 1110, prompt: true }, res: { ttl: FIVE_MINUTES, tag: 1111 } },
  wc_sessionDelete: { req: { ttl: ONE_DAY, tag: 1112 }, res: { ttl: ONE_DAY, tag: 1113 } },
  wc_sessionPing: { req: { ttl: ONE_DAY, tag: 1114 }, res: { ttl: ONE_DAY, tag: 1115 } },
  wc_pairingDelete: { req: { ttl: ONE_DAY, tag: 1000 }, res: { ttl: ONE_DAY, tag: 1001 } },
  wc_pairingPing: { req: { ttl: 30, tag: 1002 }, res: { ttl: 30, tag: 1003 } },
} as const satisfies Record<string, Record<string, PublishOptions>>;

export type WalletConnectClientOptions = {
  projectId: string;
  relayUrl: string;
  metadata: WcMetadata;
  storage: KeyValueStorage;
  userAgent?: string;
  createSocket?: RelaySocketFactory;
  fetch?: FetchLike;
  /** Milliseconds; tests move the clock. */
  now?: () => number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  requestTimeoutMs?: number;
  /**
   * How long after start the client waits before it reports what expired and reconnects to the relay. Callers attach
   * their listeners after a storage read of their own; this keeps them from missing a held request or an expiry.
   */
  startupDelayMs?: number;
};

type Delivery = { message: string; attestation?: string };
type Waiter<T> = { resolve: (value: T) => void; reject: (error: Error) => void };
type Listener = (event: never) => void;

class RequestError extends Error {
  constructor(
    message: string,
    readonly code?: number
  ) {
    super(message);
  }
}

/** The sessions the client holds, as copies: changing one does not change the client. */
class SessionView {
  constructor(private readonly client: () => WalletConnectRecord) {}

  get values(): WcSession[] {
    return this.client().sessions.map((session) => structuredClone(session));
  }

  get keys(): string[] {
    return this.client().sessions.map((session) => session.topic);
  }

  get(topic: string): WcSession {
    const session = this.client().sessions.find((entry) => entry.topic === topic);

    if (!session) throw new Error(getInternalError('NO_MATCHING_KEY', `session: ${topic}`).message);

    return structuredClone(session);
  }
}

export class WalletConnectClient {
  private record!: WalletConnectRecord;
  private readonly store: WalletConnectStore;
  private readonly relay: RelayConnection;
  private readonly verify: VerifyClient;
  private readonly listeners = new Map<WcEvent, Set<Listener>>();
  /** Responses Fearless waits for, by request id. */
  private readonly waiting = new Map<number, Waiter<JsonRpcResponse> & { topic: string; timer: ReturnType<typeof setTimeout> }>();
  /** Mobile pairings waiting for the phone to settle, by proposal id. Lost with the worker, as the attempt is. */
  private readonly approvals = new Map<number, Waiter<WcSession>>();
  private readonly acknowledgements = new Map<string, Waiter<WcSession>[]>();
  private readonly seen = new Map<string, number>();
  private inbound: Promise<void> = Promise.resolve();
  private sweepTimer?: ReturnType<typeof setTimeout>;
  private startTimer?: ReturnType<typeof setTimeout>;
  /** The relay token's subject, fresh for each worker. */
  private readonly relaySubject = randomKey();
  private closed = false;

  readonly session = new SessionView(() => this.record);

  static async init(options: WalletConnectClientOptions): Promise<WalletConnectClient> {
    const client = new WalletConnectClient(options);

    await client.start();

    return client;
  }

  private constructor(private readonly options: WalletConnectClientOptions) {
    this.store = new WalletConnectStore(options.storage);
    this.verify = new VerifyClient(options.fetch);
    this.relay = new RelayConnection({
      url: options.relayUrl,
      projectId: options.projectId,
      userAgent: options.userAgent ?? 'wc-2/fearless-wallet/browser-extension',
      authToken: (audience) =>
        relayAuthToken({
          seed: fromHexKey(this.record.clientSeed),
          audience,
          subject: this.relaySubject,
          issuedAt: this.nowSeconds(),
        }),
      onMessage: (message) => this.enqueue(message),
      createSocket: options.createSocket,
      setTimer: options.setTimer,
      clearTimer: options.clearTimer,
      requestTimeoutMs: options.requestTimeoutMs,
    });
  }

  // ---- Lifecycle and events ----------------------------------------------------------------------------------------

  private async start(): Promise<void> {
    this.record = await this.store.load();
    for (const [hash, at] of this.record.seen) this.seen.set(hash, at);
    const delay = this.options.startupDelayMs ?? 2_000;

    // What expired while the worker was stopped, and what the relay held for it, arrive once callers listen.
    this.scheduleSweep(delay);
    this.startTimer = this.timer(() => {
      this.startTimer = undefined;
      const topics = this.liveTopics();

      if (topics.length && !this.closed)
        void this.relay.subscribe(topics).catch((error) => console.warn('WalletConnect relay is unavailable', error));
    }, delay);
  }

  /** Stops the relay connection and the timers. The client cannot be used afterwards. */
  close(): void {
    this.closed = true;
    if (this.sweepTimer) this.clear(this.sweepTimer);
    if (this.startTimer) this.clear(this.startTimer);
    this.relay.close();
    for (const [id, waiter] of this.waiting) {
      this.clear(waiter.timer);
      waiter.reject(new Error('WalletConnect client closed'));
      this.waiting.delete(id);
    }
    for (const waiter of this.approvals.values()) waiter.reject(new Error('WalletConnect client closed'));
    this.approvals.clear();
    for (const waiters of this.acknowledgements.values()) for (const waiter of waiters) waiter.reject(new Error('WalletConnect client closed'));
    this.acknowledgements.clear();
  }

  on<E extends WcEvent>(event: E, listener: (args: WcEvents[E]) => void): this {
    let set = this.listeners.get(event);

    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener);

    return this;
  }

  off<E extends WcEvent>(event: E, listener: (args: WcEvents[E]) => void): this {
    this.listeners.get(event)?.delete(listener as Listener);

    return this;
  }

  private emit<E extends WcEvent>(event: E, args: WcEvents[E]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as (value: WcEvents[E]) => void)(args);
      } catch (error) {
        console.error(error);
      }
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  private nowSeconds(): number {
    return Math.floor(this.now() / 1000);
  }

  private timer(callback: () => void, delay: number): ReturnType<typeof setTimeout> {
    return (this.options.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms)))(callback, delay);
  }

  private clear(timer: ReturnType<typeof setTimeout>): void {
    (this.options.clearTimer ?? ((value: ReturnType<typeof setTimeout>) => clearTimeout(value)))(timer);
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(getInternalError('NOT_INITIALIZED').message);
  }

  private persist(): Promise<void> {
    this.record.seen = [...this.seen.entries()].slice(-MAX_SEEN);

    return this.store.save(this.record);
  }

  private liveTopics(): string[] {
    return [
      ...this.record.pairings.map((pairing) => pairing.topic),
      ...this.record.sessions.map((session) => session.topic),
      ...this.record.sentProposals.flatMap((sent) => (sent.settlementTopic ? [sent.settlementTopic] : [])),
    ];
  }

  private findSession(topic: string): WcSession | undefined {
    return this.record.sessions.find((session) => session.topic === topic);
  }

  private findPairing(topic: string): WcPairing | undefined {
    return this.record.pairings.find((pairing) => pairing.topic === topic);
  }

  private isWalletSession(session: WcSession): boolean {
    return session.controller === session.self.publicKey;
  }

  private async publish(topic: string, payload: JsonRpcPayload, options: PublishOptions): Promise<void> {
    const symKey = this.record.keys[topic];

    if (!symKey) throw new Error(getInternalError('NO_MATCHING_KEY', `topic: ${topic}`).message);
    const message = encrypt({ symKey, message: JSON.stringify(payload) });

    this.seen.set(hashMessage(message), this.now());
    await this.relay.publish({ topic, message, ...options });
  }

  private respondTo(topic: string, response: JsonRpcResponse, options: PublishOptions): Promise<void> {
    return this.publish(topic, response, options).catch((error) => console.warn('WalletConnect response was not sent', error));
  }

  private waitFor(topic: string, id: number, timeoutMs: number): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      const timer = this.timer(() => {
        this.waiting.delete(id);
        reject(new RequestError(getInternalError('EXPIRED', `request: ${id}`).message));
      }, timeoutMs);

      this.waiting.set(id, { topic, resolve, reject, timer });
    });
  }

  // ---- Wallet role: dApps pair with Fearless -----------------------------------------------------------------------

  /** Subscribes to a dApp's pairing link. Its proposal arrives as `session_proposal`. */
  async pair({ uri }: { uri: string }): Promise<WcPairing> {
    this.assertOpen();
    const parsed = parsePairingUri(uri);
    const now = this.nowSeconds();

    if (parsed.expiryTimestamp !== undefined && parsed.expiryTimestamp <= now)
      throw new Error(getInternalError('EXPIRED', 'pairing link').message);
    const existing = this.findPairing(parsed.topic);

    if (existing?.active) throw new Error(`Pairing already exists: ${parsed.topic}. Please try again with a new connection URI.`);
    const pairing: WcPairing = {
      topic: parsed.topic,
      expiry: Math.min(parsed.expiryTimestamp ?? now + FIVE_MINUTES, now + THIRTY_DAYS),
      relay: parsed.relay,
      active: false,
      ...(parsed.methods ? { methods: parsed.methods } : {}),
    };

    this.record.keys[parsed.topic] = parsed.symKey;
    this.record.pairings = [...this.record.pairings.filter((entry) => entry.topic !== parsed.topic), pairing];
    await this.persist();
    this.scheduleSweep();
    await this.relay.subscribe([parsed.topic]);

    return structuredClone(pairing);
  }

  private readProposal(topic: string, request: JsonRpcRequest): WcProposal | undefined {
    const params = request.params as Record<string, unknown> | undefined;

    if (!isObject(params) || request.id <= 0) return undefined;
    const proposer = readParticipant(params.proposer);
    const requiredNamespaces = readProposalNamespaces(params.requiredNamespaces);
    const optionalNamespaces = readProposalNamespaces(params.optionalNamespaces);
    const sessionProperties = readProperties(params.sessionProperties);
    const relays = Array.isArray(params.relays) && params.relays.length ? params.relays.slice(0, 8).map(readRelay) : [{ protocol: 'irn' }];

    if (!proposer || !requiredNamespaces || !optionalNamespaces || sessionProperties === false || relays.some((relay) => !relay))
      return undefined;
    const now = this.nowSeconds();
    const claimed = typeof params.expiryTimestamp === 'number' ? params.expiryTimestamp : undefined;
    const expiryTimestamp =
      claimed !== undefined && Number.isSafeInteger(claimed) ? Math.min(claimed, now + THIRTY_DAYS) : now + FIVE_MINUTES;
    const proposal: WcProposal = {
      id: request.id,
      expiryTimestamp,
      relays: relays as WcProposal['relays'],
      proposer,
      requiredNamespaces,
      optionalNamespaces,
      // The topic it arrived on, not whatever the message claims.
      pairingTopic: topic,
    };

    if (sessionProperties) proposal.sessionProperties = sessionProperties;
    if (isObject(params.scopedProperties) && JSON.stringify(params.scopedProperties).length <= 16_384)
      proposal.scopedProperties = structuredClone(params.scopedProperties);

    return proposal;
  }

  private async onSessionPropose(topic: string, request: JsonRpcRequest, delivery: Delivery): Promise<void> {
    const pairing = this.findPairing(topic);
    const proposal = pairing ? this.readProposal(topic, request) : undefined;

    if (!pairing || !proposal || proposal.expiryTimestamp <= this.nowSeconds()) return;
    if (this.record.proposals.some((entry) => entry.id === proposal.id)) return;
    this.record.proposals = [...this.record.proposals, proposal].slice(-MAX_PENDING_PROPOSALS);
    pairing.peerMetadata = proposal.proposer.metadata;
    await this.persist();
    this.scheduleSweep();
    const verifyContext = await this.verify.context({
      metadata: proposal.proposer.metadata,
      message: delivery.message,
      attestation: delivery.attestation,
    });

    if (!this.record.proposals.some((entry) => entry.id === proposal.id)) return;
    this.emit('session_proposal', { id: proposal.id, params: structuredClone(proposal), verifyContext });
  }

  /** Approves a dApp's proposal: settles a new session in which Fearless is the controller. */
  async approve(params: WcApproveParams): Promise<WcApproveResult> {
    this.assertOpen();
    const proposal = this.record.proposals.find((entry) => entry.id === params.id);

    if (!proposal) throw new Error(getInternalError('NO_MATCHING_KEY', `proposal: ${params.id}`).message);
    const now = this.nowSeconds();

    if (proposal.expiryTimestamp <= now) {
      this.record.proposals = this.record.proposals.filter((entry) => entry.id !== proposal.id);
      await this.persist();
      throw new Error(getInternalError('EXPIRED', `proposal: ${params.id}`).message);
    }
    const namespaces = readSessionNamespaces(params.namespaces);
    const sessionProperties = readProperties(params.sessionProperties);

    if (!namespaces || sessionProperties === false)
      throw new Error(getInternalError('MISSING_OR_INVALID', 'session namespaces').message);
    if (!this.record.keys[proposal.pairingTopic]) throw new Error(getInternalError('NO_MATCHING_KEY', 'pairing').message);
    const self = generateKeyPair();
    const symKey = deriveSymKey(self.privateKey, proposal.proposer.publicKey);
    const topic = topicOf(symKey);
    const relay = { protocol: params.relayProtocol ?? 'irn' };
    const expiry = now + SEVEN_DAYS;
    const session: WcSession = {
      topic,
      pairingTopic: proposal.pairingTopic,
      relay,
      expiry,
      acknowledged: false,
      controller: self.publicKey,
      namespaces,
      requiredNamespaces: proposal.requiredNamespaces,
      optionalNamespaces: proposal.optionalNamespaces,
      ...(sessionProperties ? { sessionProperties } : {}),
      self: { publicKey: self.publicKey, metadata: this.options.metadata },
      peer: proposal.proposer,
      transportType: 'relay',
    };
    const settleId = payloadId(this.now());

    this.record.keys[topic] = symKey;
    this.record.sessions.push(session);
    this.record.settlements[topic] = settleId;
    this.record.proposals = this.record.proposals.filter((entry) => entry.id !== proposal.id);
    const pairing = this.findPairing(proposal.pairingTopic);

    if (pairing) {
      pairing.active = true;
      pairing.expiry = now + THIRTY_DAYS;
      pairing.peerMetadata = proposal.proposer.metadata;
    }
    await this.persist();
    try {
      await this.relay.subscribe([topic]);
      await this.publish(
        proposal.pairingTopic,
        formatJsonRpcResult(proposal.id, { relay, responderPublicKey: self.publicKey }),
        RPC.wc_sessionPropose.res
      );
      await this.publish(
        topic,
        formatJsonRpcRequest(
          'wc_sessionSettle',
          {
            relay,
            namespaces,
            ...(sessionProperties ? { sessionProperties } : {}),
            expiry,
            controller: { publicKey: self.publicKey, metadata: this.options.metadata },
          },
          settleId
        ),
        RPC.wc_sessionSettle.req
      );
    } catch (error) {
      await this.forgetSession(topic, error instanceof Error ? error : new Error('Session settlement failed'));
      throw error;
    }
    this.scheduleSweep();

    return { topic, acknowledged: () => this.acknowledgement(topic) };
  }

  private acknowledgement(topic: string): Promise<WcSession> {
    const session = this.findSession(topic);

    if (!session) return Promise.reject(new Error(getInternalError('NO_MATCHING_KEY', `session: ${topic}`).message));
    if (session.acknowledged) return Promise.resolve(structuredClone(session));

    return new Promise((resolve, reject) => {
      this.acknowledgements.set(topic, [...(this.acknowledgements.get(topic) ?? []), { resolve, reject }]);
    });
  }

  /** Refuses a dApp's proposal and tells the dApp why. */
  async reject({ id, reason }: WcRejectParams): Promise<void> {
    this.assertOpen();
    const proposal = this.record.proposals.find((entry) => entry.id === id);

    if (!proposal) throw new Error(getInternalError('NO_MATCHING_KEY', `proposal: ${id}`).message);
    this.record.proposals = this.record.proposals.filter((entry) => entry.id !== id);
    await this.persist();
    await this.publish(proposal.pairingTopic, formatJsonRpcError(id, reason), RPC.wc_sessionPropose.reject);
  }

  /** Answers a dApp's session request. */
  async respond({ topic, response }: WcRespondParams): Promise<void> {
    this.assertOpen();
    const session = this.findSession(topic);

    if (!session || !this.isWalletSession(session)) throw new Error(getInternalError('NO_MATCHING_KEY', `session: ${topic}`).message);
    if (!isJsonRpcResponse(response)) throw new Error(getInternalError('MISSING_OR_INVALID', 'response').message);
    this.record.requests = this.record.requests.filter((entry) => !(entry.topic === topic && entry.id === response.id));
    await this.persist();
    await this.publish(topic, response, RPC.wc_sessionRequest.res);
  }

  private async onSessionRequest(session: WcSession, request: JsonRpcRequest, delivery: Delivery): Promise<void> {
    const reply = (error: WcErrorReason) =>
      this.respondTo(session.topic, formatJsonRpcError(request.id, error), RPC.wc_sessionRequest.res);

    // Fearless signs only in sessions it settled as the wallet, and only once the dApp confirmed the settlement.
    if (!this.isWalletSession(session)) return reply(getSdkError('UNAUTHORIZED_METHOD', 'wc_sessionRequest'));
    if (!session.acknowledged) return reply(getSdkError('UNAUTHORIZED_METHOD', 'session is not settled'));
    const params = request.params as Record<string, unknown> | undefined;
    const body = isObject(params) ? params.request : undefined;

    if (
      !isObject(params) ||
      !isObject(body) ||
      typeof body.method !== 'string' ||
      !body.method ||
      body.method.length > 256 ||
      !isChainId(params.chainId)
    )
      return reply(getSdkError('INVALID_METHOD'));
    if (this.record.requests.some((entry) => entry.topic === session.topic && entry.id === request.id)) return;
    const now = this.nowSeconds();
    const claimed = body.expiryTimestamp;

    if (claimed !== undefined && (typeof claimed !== 'number' || !Number.isSafeInteger(claimed)))
      return reply(getSdkError('INVALID_METHOD'));
    const expiryTimestamp = Math.min(typeof claimed === 'number' ? claimed : now + FIFTEEN_MINUTES, now + SEVEN_DAYS);

    if (expiryTimestamp <= now) return;
    this.record.requests = [...this.record.requests, { id: request.id, topic: session.topic, expiryTimestamp }].slice(
      -MAX_PENDING_REQUESTS
    );
    await this.persist();
    this.scheduleSweep();
    const verifyContext = await this.verify.context({
      metadata: session.peer.metadata,
      message: delivery.message,
      attestation: delivery.attestation,
    });

    if (!this.findSession(session.topic)) return;
    this.emit('session_request', {
      id: request.id,
      topic: session.topic,
      params: { request: structuredClone(body) as WcRequest, chainId: params.chainId },
      verifyContext,
    });
  }

  // ---- dApp role: Fearless pairs with a phone wallet ---------------------------------------------------------------

  /** Proposes a session to a wallet: share the URI with it, and the approval resolves once the wallet settles. */
  async connect(params: WcConnectParams): Promise<WcConnectResult> {
    this.assertOpen();
    const requiredNamespaces = readProposalNamespaces(params.requiredNamespaces ?? {});
    const optionalNamespaces = readProposalNamespaces(params.optionalNamespaces ?? {});
    const sessionProperties = readProperties(params.sessionProperties);

    if (!requiredNamespaces || !optionalNamespaces || sessionProperties === false)
      throw new Error(getInternalError('MISSING_OR_INVALID', 'proposal namespaces').message);
    const symKey = randomKey();
    const pairingTopic = topicOf(symKey);
    const self = generateKeyPair();
    const expiryTimestamp = this.nowSeconds() + FIVE_MINUTES;
    const relays = [{ protocol: 'irn' }];
    const proposal: WcProposal = {
      id: payloadId(this.now()),
      expiryTimestamp,
      relays,
      proposer: { publicKey: self.publicKey, metadata: this.options.metadata },
      requiredNamespaces,
      optionalNamespaces,
      ...(sessionProperties ? { sessionProperties } : {}),
      pairingTopic,
    };

    this.record.keys[pairingTopic] = symKey;
    this.record.keys[self.publicKey] = self.privateKey;
    this.record.pairings.push({ topic: pairingTopic, expiry: expiryTimestamp, relay: relays[0], active: false });
    this.record.sentProposals.push({ proposal });
    await this.persist();
    const approval = new Promise<WcSession>((resolve, reject) => this.approvals.set(proposal.id, { resolve, reject }));

    // The caller may never ask for the approval; its failure is still reported through it, not as unhandled.
    approval.catch(() => undefined);
    try {
      await this.relay.subscribe([pairingTopic]);
      await this.publish(pairingTopic, formatJsonRpcRequest('wc_sessionPropose', proposal, proposal.id), RPC.wc_sessionPropose.req);
    } catch (error) {
      await this.forgetSentProposal(proposal.id, error instanceof Error ? error : new Error('Proposal was not sent'));
      throw error;
    }
    this.scheduleSweep();

    return {
      uri: formatPairingUri({ topic: pairingTopic, symKey, relay: relays[0], expiryTimestamp }),
      approval: () => approval,
    };
  }

  private async forgetSentProposal(id: number, reason: Error): Promise<void> {
    const sent = this.record.sentProposals.find((entry) => entry.proposal.id === id);

    this.approvals.get(id)?.reject(reason);
    this.approvals.delete(id);
    if (!sent) return;
    this.record.sentProposals = this.record.sentProposals.filter((entry) => entry !== sent);
    delete this.record.keys[sent.proposal.proposer.publicKey];
    // A failed or abandoned attempt leaves nothing: neither its pairing nor a half-derived session key.
    const topics = [sent.settlementTopic, sent.proposal.pairingTopic].filter(
      (topic): topic is string => !!topic && !this.findSession(topic)
    );

    for (const topic of topics) {
      delete this.record.keys[topic];
      this.record.pairings = this.record.pairings.filter((pairing) => pairing.topic !== topic);
    }
    await this.persist();
    await Promise.all(topics.map((topic) => this.relay.unsubscribe(topic).catch(() => undefined)));
  }

  private async onProposalResponse(sent: SentProposal, response: JsonRpcResponse): Promise<void> {
    if (sent.settlementTopic) return;
    if (isJsonRpcError(response)) {
      await this.forgetSentProposal(sent.proposal.id, new RequestError(response.error.message, response.error.code));
      return;
    }
    const result = response.result as Record<string, unknown> | undefined;
    const privateKey = this.record.keys[sent.proposal.proposer.publicKey];

    if (!isObject(result) || !isHexKey(result.responderPublicKey) || !isHexKey(privateKey)) {
      await this.forgetSentProposal(sent.proposal.id, new Error(getSdkError('SESSION_SETTLEMENT_FAILED').message));
      return;
    }
    const symKey = deriveSymKey(privateKey, result.responderPublicKey);
    const topic = topicOf(symKey);

    this.record.keys[topic] = symKey;
    sent.settlementTopic = topic;
    sent.responderPublicKey = result.responderPublicKey;
    const pairing = this.findPairing(sent.proposal.pairingTopic);

    if (pairing) {
      pairing.active = true;
      pairing.expiry = this.nowSeconds() + THIRTY_DAYS;
    }
    await this.persist();
    await this.relay.subscribe([topic]);
  }

  private async onSessionSettle(sent: SentProposal, topic: string, request: JsonRpcRequest): Promise<void> {
    const params = request.params as Record<string, unknown> | undefined;
    const refuse = async (reason: WcErrorReason) => {
      await this.respondTo(topic, formatJsonRpcError(request.id, reason), RPC.wc_sessionSettle.res);
      await this.forgetSentProposal(sent.proposal.id, new Error(reason.message));
    };
    const waiter = this.approvals.get(sent.proposal.id);

    // Nobody waits for a settlement after the worker restarted or the attempt ended: it is refused, not adopted.
    if (!waiter) return refuse(getSdkError('USER_REJECTED'));
    if (!isObject(params)) return refuse(getSdkError('INVALID_SESSION_SETTLE_REQUEST'));
    const controller = readParticipant(params.controller);
    const relay = readRelay(params.relay);
    const namespaces = readSessionNamespaces(params.namespaces);
    const sessionProperties = readProperties(params.sessionProperties);
    const now = this.nowSeconds();
    const expiry = params.expiry;

    if (
      !controller ||
      controller.publicKey !== sent.responderPublicKey ||
      !relay ||
      !namespaces ||
      sessionProperties === false ||
      typeof expiry !== 'number' ||
      !Number.isSafeInteger(expiry) ||
      expiry <= now ||
      expiry > now + SEVEN_DAYS + FIVE_MINUTES
    )
      return refuse(getSdkError('INVALID_SESSION_SETTLE_REQUEST'));
    if (!coversRequired(sent.proposal.requiredNamespaces, namespaces)) return refuse(getSdkError('UNSUPPORTED_CHAINS'));
    const session: WcSession = {
      topic,
      pairingTopic: sent.proposal.pairingTopic,
      relay,
      expiry,
      acknowledged: true,
      controller: controller.publicKey,
      namespaces,
      requiredNamespaces: sent.proposal.requiredNamespaces,
      optionalNamespaces: sent.proposal.optionalNamespaces,
      ...(sessionProperties ? { sessionProperties } : {}),
      self: { publicKey: sent.proposal.proposer.publicKey, metadata: this.options.metadata },
      peer: controller,
      transportType: 'relay',
    };

    this.record.sessions.push(session);
    this.record.sentProposals = this.record.sentProposals.filter((entry) => entry !== sent);
    delete this.record.keys[sent.proposal.proposer.publicKey];
    await this.persist();
    this.scheduleSweep();
    await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionSettle.res);
    this.approvals.delete(sent.proposal.id);
    waiter.resolve(structuredClone(session));
  }

  /** Sends a request to the wallet of a session Fearless opened as the dApp, and returns the wallet's result. */
  async request<T = unknown>(params: WcRequestParams): Promise<T> {
    this.assertOpen();
    const session = this.findSession(params.topic);

    if (!session || this.isWalletSession(session) || !session.acknowledged || session.expiry <= this.nowSeconds())
      throw new Error(getInternalError('NO_MATCHING_KEY', `session: ${params.topic}`).message);
    if (!isChainId(params.chainId) || typeof params.request?.method !== 'string')
      throw new Error(getInternalError('MISSING_OR_INVALID', 'request').message);
    const lifetime = Math.min(Math.max(params.expiry ?? FIFTEEN_MINUTES, FIVE_MINUTES), SEVEN_DAYS);
    const id = payloadId(this.now());
    const response = this.waitFor(params.topic, id, lifetime * 1000);

    try {
      await this.publish(
        params.topic,
        formatJsonRpcRequest(
          'wc_sessionRequest',
          { request: { ...params.request, expiryTimestamp: this.nowSeconds() + lifetime }, chainId: params.chainId },
          id
        ),
        { ...RPC.wc_sessionRequest.req, ttl: lifetime }
      );
    } catch (error) {
      const waiter = this.waiting.get(id);

      if (waiter) this.clear(waiter.timer);
      this.waiting.delete(id);
      throw error;
    }
    const answer = await response;

    if (isJsonRpcError(answer)) throw new RequestError(answer.error.message, answer.error.code);

    return answer.result as T;
  }

  // ---- Both roles ---------------------------------------------------------------------------------------------------

  /** Checks that the peer of a session or pairing still answers. */
  async ping({ topic }: { topic: string }): Promise<void> {
    this.assertOpen();
    const session = this.findSession(topic);

    if (!session && !this.findPairing(topic)) throw new Error(getInternalError('MISMATCHED_TOPIC', topic).message);
    const id = payloadId(this.now());
    const answer = this.waitFor(topic, id, 30_000);

    try {
      await this.publish(
        topic,
        formatJsonRpcRequest(session ? 'wc_sessionPing' : 'wc_pairingPing', {}, id),
        session ? RPC.wc_sessionPing.req : RPC.wc_pairingPing.req
      );
    } catch (error) {
      const waiter = this.waiting.get(id);

      if (waiter) this.clear(waiter.timer);
      this.waiting.delete(id);
      throw error;
    }
    const response = await answer;

    if (isJsonRpcError(response)) throw new RequestError(response.error.message, response.error.code);
  }

  /** Ends a session or a pairing: the peer is told, and the keys are forgotten here first. */
  async disconnect({ topic, reason }: WcDisconnectParams): Promise<void> {
    this.assertOpen();
    const session = this.findSession(topic);
    const pairing = session ? undefined : this.findPairing(topic);

    if (!session && !pairing) throw new Error(getInternalError('MISMATCHED_TOPIC', topic).message);
    const symKey = this.record.keys[topic];
    const method = session ? 'wc_sessionDelete' : 'wc_pairingDelete';
    const message = symKey ? encrypt({ symKey, message: JSON.stringify(formatJsonRpcRequest(method, reason)) }) : undefined;

    if (session) await this.forgetSession(topic, new Error(reason.message));
    else await this.forgetPairing(topic);
    if (message) await this.relay.publish({ topic, message, ...(session ? RPC.wc_sessionDelete.req : RPC.wc_pairingDelete.req) });
  }

  private async forgetSession(topic: string, reason: Error): Promise<void> {
    const existed = !!this.findSession(topic);

    this.record.sessions = this.record.sessions.filter((session) => session.topic !== topic);
    this.record.requests = this.record.requests.filter((entry) => entry.topic !== topic);
    delete this.record.settlements[topic];
    delete this.record.keys[topic];
    for (const waiter of this.acknowledgements.get(topic) ?? []) waiter.reject(reason);
    this.acknowledgements.delete(topic);
    for (const [id, waiter] of this.waiting) {
      if (waiter.topic !== topic) continue;
      this.clear(waiter.timer);
      waiter.reject(reason);
      this.waiting.delete(id);
    }
    if (existed) await this.persist();
    await this.relay.unsubscribe(topic).catch(() => undefined);
  }

  private async forgetPairing(topic: string): Promise<void> {
    this.record.pairings = this.record.pairings.filter((pairing) => pairing.topic !== topic);
    this.record.proposals = this.record.proposals.filter((proposal) => proposal.pairingTopic !== topic);
    if (!this.record.sentProposals.some((sent) => sent.proposal.pairingTopic === topic)) delete this.record.keys[topic];
    await this.persist();
    await this.relay.unsubscribe(topic).catch(() => undefined);
  }

  // ---- Incoming messages --------------------------------------------------------------------------------------------

  private enqueue(message: RelayMessage): void {
    this.inbound = this.inbound
      .then(() => this.process(message))
      .catch((error) => console.warn('WalletConnect message was not handled', error));
  }

  private async process({ topic, message, attestation }: RelayMessage): Promise<void> {
    if (this.closed) return;
    const hash = hashMessage(message);

    if (this.seen.has(hash)) return;
    const symKey = this.record.keys[topic];

    if (!symKey) return;
    let payload: unknown;

    try {
      payload = JSON.parse(decrypt(symKey, message));
    } catch {
      // Not for this key, or not a type 0 envelope: nothing Fearless can act on.
      return;
    }
    this.seen.set(hash, this.now());
    if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.keys().next().value as string);
    if (isJsonRpcRequest(payload)) await this.onRequest(topic, payload, { message, attestation });
    else if (isJsonRpcResponse(payload)) await this.onResponse(topic, payload);
  }

  private async onRequest(topic: string, request: JsonRpcRequest, delivery: Delivery): Promise<void> {
    const pairing = this.findPairing(topic);
    const session = this.findSession(topic);
    const settling = this.record.sentProposals.find((sent) => sent.settlementTopic === topic);

    if (pairing && !session) {
      switch (request.method) {
        case 'wc_sessionPropose':
          return this.onSessionPropose(topic, request, delivery);
        case 'wc_pairingPing':
          return this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_pairingPing.res);
        case 'wc_pairingDelete':
          await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_pairingDelete.res);
          if (!this.record.sentProposals.some((sent) => sent.proposal.pairingTopic === topic)) await this.forgetPairing(topic);
          return;
        default:
          // One-click authentication and other pairing methods are not offered; a dApp falls back to its proposal.
          return;
      }
    }
    if (settling && !session) {
      if (request.method === 'wc_sessionSettle') return this.onSessionSettle(settling, topic, request);
      return;
    }
    if (!session) return;
    const peerIsController = session.controller === session.peer.publicKey;

    switch (request.method) {
      case 'wc_sessionRequest':
        return this.onSessionRequest(session, request, delivery);
      case 'wc_sessionPing':
        await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionPing.res);
        this.emit('session_ping', { id: request.id, topic });
        return;
      case 'wc_sessionDelete':
        await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionDelete.res);
        await this.forgetSession(topic, new Error(getSdkError('USER_DISCONNECTED').message));
        this.emit('session_delete', { id: request.id, topic });
        return;
      case 'wc_sessionEvent': {
        const params = request.params as Record<string, unknown> | undefined;
        const event = isObject(params) ? params.event : undefined;

        await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionEvent.res);
        if (isObject(params) && isObject(event) && typeof event.name === 'string' && isChainId(params.chainId))
          this.emit('session_event', {
            id: request.id,
            topic,
            params: { event: { name: event.name, data: structuredClone(event.data) }, chainId: params.chainId },
          });
        return;
      }
      case 'wc_sessionUpdate': {
        const namespaces = isObject(request.params) ? readSessionNamespaces(request.params.namespaces) : undefined;

        if (!peerIsController)
          return this.respondTo(topic, formatJsonRpcError(request.id, getSdkError('UNAUTHORIZED_UPDATE_REQUEST')), RPC.wc_sessionUpdate.res);
        if (!namespaces || !coversRequired(session.requiredNamespaces, namespaces))
          return this.respondTo(topic, formatJsonRpcError(request.id, getSdkError('INVALID_UPDATE_REQUEST')), RPC.wc_sessionUpdate.res);
        session.namespaces = namespaces;
        await this.persist();
        await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionUpdate.res);
        this.emit('session_update', { id: request.id, topic, params: { namespaces: structuredClone(namespaces) } });
        return;
      }
      case 'wc_sessionExtend':
        if (!peerIsController)
          return this.respondTo(topic, formatJsonRpcError(request.id, getSdkError('UNAUTHORIZED_EXTEND_REQUEST')), RPC.wc_sessionExtend.res);
        session.expiry = Math.max(session.expiry, this.nowSeconds() + SEVEN_DAYS);
        await this.persist();
        this.scheduleSweep();
        await this.respondTo(topic, formatJsonRpcResult(request.id, true), RPC.wc_sessionExtend.res);
        this.emit('session_extend', { id: request.id, topic });
        return;
      default:
        return this.respondTo(topic, formatJsonRpcError(request.id, getSdkError('WC_METHOD_UNSUPPORTED', request.method)), {
          ttl: ONE_DAY,
          tag: 0,
        });
    }
  }

  private async onResponse(topic: string, response: JsonRpcResponse): Promise<void> {
    const waiter = this.waiting.get(response.id);

    if (waiter && waiter.topic === topic) {
      this.waiting.delete(response.id);
      this.clear(waiter.timer);
      waiter.resolve(response);
      return;
    }
    const sent = this.record.sentProposals.find((entry) => entry.proposal.id === response.id && entry.proposal.pairingTopic === topic);

    if (sent) return this.onProposalResponse(sent, response);
    if (this.record.settlements[topic] === response.id) {
      delete this.record.settlements[topic];
      const session = this.findSession(topic);

      if (!session) return;
      if (isJsonRpcError(response)) {
        await this.forgetSession(topic, new Error(response.error.message));
        this.emit('session_delete', { id: response.id, topic });
        return;
      }
      session.acknowledged = true;
      await this.persist();
      for (const pending of this.acknowledgements.get(topic) ?? []) pending.resolve(structuredClone(session));
      this.acknowledgements.delete(topic);
    }
  }

  // ---- Expiry -------------------------------------------------------------------------------------------------------

  private scheduleSweep(delayMs?: number): void {
    if (this.closed) return;
    if (this.sweepTimer) this.clear(this.sweepTimer);
    const deadlines = [
      ...this.record.proposals.map((proposal) => proposal.expiryTimestamp),
      ...this.record.sentProposals.map((sent) => sent.proposal.expiryTimestamp),
      ...this.record.requests.map((entry) => entry.expiryTimestamp),
      ...this.record.sessions.map((session) => session.expiry),
      ...this.record.pairings.map((pairing) => pairing.expiry),
    ];
    const next = deadlines.length ? Math.min(...deadlines) * 1000 - this.now() : MAX_SWEEP_DELAY_MS;
    const delay = delayMs ?? Math.min(Math.max(next, 0) + 50, MAX_SWEEP_DELAY_MS);

    this.sweepTimer = this.timer(() => {
      this.sweepTimer = undefined;
      this.inbound = this.inbound.then(() => this.sweep()).catch((error) => console.warn('WalletConnect expiry failed', error));
    }, delay);
  }

  private async sweep(): Promise<void> {
    if (this.closed) return;
    const now = this.nowSeconds();
    let changed = false;

    for (const proposal of this.record.proposals.filter((entry) => entry.expiryTimestamp <= now)) {
      this.record.proposals = this.record.proposals.filter((entry) => entry !== proposal);
      changed = true;
      this.emit('proposal_expire', { id: proposal.id });
    }
    for (const sent of this.record.sentProposals.filter((entry) => entry.proposal.expiryTimestamp <= now))
      await this.forgetSentProposal(sent.proposal.id, new Error(getInternalError('EXPIRED', 'proposal').message));
    for (const entry of this.record.requests.filter((request) => request.expiryTimestamp <= now)) {
      this.record.requests = this.record.requests.filter((request) => request !== entry);
      changed = true;
      this.emit('session_request_expire', { id: entry.id, topic: entry.topic });
    }
    for (const session of this.record.sessions.filter((entry) => entry.expiry <= now)) {
      await this.forgetSession(session.topic, new Error(getInternalError('EXPIRED', 'session').message));
      this.emit('session_expire', { topic: session.topic });
    }
    for (const pairing of this.record.pairings.filter((entry) => entry.expiry <= now)) await this.forgetPairing(pairing.topic);
    const dayAgo = this.now() - ONE_DAY * 1000;

    for (const [hash, at] of this.seen) if (at < dayAgo) this.seen.delete(hash);
    if (changed) await this.persist();
    this.scheduleSweep();
  }
}
