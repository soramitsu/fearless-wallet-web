// The WalletConnect relay over a WebSocket: subscribe to topics, publish to them, receive what peers published, and
// fetch what arrived while this worker was not running. The relay only ever sees encrypted envelopes.

import { formatJsonRpcRequest, formatJsonRpcResult, isJsonRpcRequest, isJsonRpcResponse } from '@extension-base/utils/jsonRpc';
import { isHexKey } from './crypto';

export type RelayMessage = { topic: string; message: string; publishedAt: number; tag?: number; attestation?: string };

export type PublishParams = { topic: string; message: string; ttl: number; tag: number; prompt?: boolean };

/** The part of the browser WebSocket this client uses, so tests can stand in a fake relay. */
export interface RelaySocket {
  readonly readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RelaySocketFactory = (url: string) => RelaySocket;

export type RelayConnectionOptions = {
  url: string;
  projectId: string;
  userAgent: string;
  /** A fresh sign-in token for the relay URL; called for every connection. */
  authToken: (audience: string) => string | Promise<string>;
  /** Each message a peer published to a subscribed topic, in the order the relay delivers them. */
  onMessage: (message: RelayMessage) => void;
  createSocket?: RelaySocketFactory;
  requestTimeoutMs?: number;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
};

const OPEN = 1;
const MAX_FRAME_CHARS = 2_000_000;
const SUBSCRIBE_BATCH = 100;
const MAX_FETCH_ROUNDS = 25;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

const defaultSocket: RelaySocketFactory = (url) => new WebSocket(url) as unknown as RelaySocket;

function relayMessage(value: unknown): RelayMessage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const data = value as Record<string, unknown>;

  if (!isHexKey(data.topic) || typeof data.message !== 'string' || !data.message) return undefined;
  const message: RelayMessage = {
    topic: data.topic,
    message: data.message,
    publishedAt: typeof data.publishedAt === 'number' && Number.isFinite(data.publishedAt) ? data.publishedAt : Date.now(),
  };

  if (typeof data.tag === 'number') message.tag = data.tag;
  if (typeof data.attestation === 'string' && data.attestation) message.attestation = data.attestation;

  return message;
}

export class RelayConnection {
  private socket?: RelaySocket;
  private opening?: Promise<RelaySocket>;
  private readonly pending = new Map<number, Pending>();
  /** Topics this client wants to hear, and the relay's subscription id once subscribed on the current socket. */
  private readonly topics = new Map<string, string | undefined>();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDelay = RECONNECT_MIN_MS;
  private closed = false;

  constructor(private readonly options: RelayConnectionOptions) {}

  private get setTimer() {
    return this.options.setTimer ?? ((callback: () => void, delay: number) => setTimeout(callback, delay));
  }

  private get clearTimer() {
    return this.options.clearTimer ?? ((timer: ReturnType<typeof setTimeout>) => clearTimeout(timer));
  }

  get isOpen(): boolean {
    return this.socket?.readyState === OPEN;
  }

  get subscribedTopics(): string[] {
    return [...this.topics.keys()];
  }

  /** Subscribes and then fetches what the relay holds for the topics, so a message sent before is not missed. */
  async subscribe(topics: string[]): Promise<void> {
    const added = [...new Set(topics)].filter((topic) => isHexKey(topic) && !this.topics.has(topic));

    if (!added.length) return;
    this.closed = false;
    for (const topic of added) this.topics.set(topic, undefined);
    const socket = await this.open();

    // A fresh socket subscribes every wanted topic while opening.
    if (added.some((topic) => this.topics.get(topic) === undefined)) await this.subscribeOn(socket, added);
    await this.fetchMessages(added);
  }

  async unsubscribe(topic: string): Promise<void> {
    if (!this.topics.has(topic)) return;
    const id = this.topics.get(topic);

    this.topics.delete(topic);
    if (!this.topics.size) {
      this.close();
      return;
    }
    if (id && this.isOpen) await this.request('irn_unsubscribe', { topic, id }).catch(() => undefined);
  }

  async publish(params: PublishParams): Promise<void> {
    const body: Record<string, unknown> = { topic: params.topic, message: params.message, ttl: params.ttl, tag: params.tag };

    if (params.prompt) body.prompt = true;
    try {
      await this.request('irn_publish', body);
    } finally {
      // A last message, such as a disconnection, does not leave a connection open with nothing to hear.
      if (!this.topics.size) this.close();
    }
  }

  /** Delivers held messages for the topics, oldest first. */
  async fetchMessages(topics: string[]): Promise<void> {
    for (let start = 0; start < topics.length; start += SUBSCRIBE_BATCH) {
      const batch = topics.slice(start, start + SUBSCRIBE_BATCH);

      for (let round = 0; round < MAX_FETCH_ROUNDS; round++) {
        const result = (await this.request('irn_batchFetchMessages', { topics: batch })) as
          | { messages?: unknown[]; hasMore?: boolean }
          | undefined;
        const messages = (Array.isArray(result?.messages) ? result!.messages : [])
          .map(relayMessage)
          .filter((message): message is RelayMessage => !!message && this.topics.has(message.topic))
          .sort((a, b) => a.publishedAt - b.publishedAt);

        for (const message of messages) this.deliver(message);
        if (!result?.hasMore) break;
      }
    }
  }

  /** Closes the connection and stops reconnecting until the next subscription. */
  close(): void {
    this.closed = true;
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;

    this.socket = undefined;
    this.opening = undefined;
    for (const topic of this.topics.keys()) this.topics.set(topic, undefined);
    this.failPending(new Error('Relay connection closed'));
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      try {
        socket.close(1000, 'closed by client');
      } catch {
        /* already closed */
      }
    }
  }

  private deliver(message: RelayMessage): void {
    try {
      this.options.onMessage(message);
    } catch (error) {
      console.error(error);
    }
  }

  private failPending(error: Error): void {
    for (const [id, entry] of this.pending) {
      this.clearTimer(entry.timer);
      entry.reject(error);
      this.pending.delete(id);
    }
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const socket = await this.open();

    return this.send(socket, method, params);
  }

  private send(socket: RelaySocket, method: string, params: unknown): Promise<unknown> {
    const payload = formatJsonRpcRequest(method, params);

    return new Promise((resolve, reject) => {
      const timer = this.setTimer(() => {
        this.pending.delete(payload.id);
        reject(new Error(`Relay did not answer ${method}`));
        // A socket that stopped answering is replaced.
        if (this.socket === socket) this.drop(socket);
      }, this.options.requestTimeoutMs ?? 15_000);

      this.pending.set(payload.id, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify(payload));
      } catch (error) {
        this.clearTimer(timer);
        this.pending.delete(payload.id);
        reject(error instanceof Error ? error : new Error('Relay send failed'));
      }
    });
  }

  private async subscribeOn(socket: RelaySocket, topics: string[]): Promise<void> {
    for (let start = 0; start < topics.length; start += SUBSCRIBE_BATCH) {
      const batch = topics.slice(start, start + SUBSCRIBE_BATCH);
      const ids = batch.length === 1
        ? [await this.send(socket, 'irn_subscribe', { topic: batch[0] })]
        : await this.send(socket, 'irn_batchSubscribe', { topics: batch });

      batch.forEach((topic, index) => {
        const id = Array.isArray(ids) ? ids[index] : undefined;

        if (this.topics.has(topic)) this.topics.set(topic, typeof id === 'string' ? id : '');
      });
    }
  }

  private open(): Promise<RelaySocket> {
    if (this.socket && this.socket.readyState === OPEN) return Promise.resolve(this.socket);
    if (this.opening) return this.opening;
    if (this.reconnectTimer) {
      this.clearTimer(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const opening = this.connect().finally(() => {
      if (this.opening === opening) this.opening = undefined;
    });

    this.opening = opening;

    return opening;
  }

  private async connect(): Promise<RelaySocket> {
    const token = await this.options.authToken(this.options.url);
    const query = new URLSearchParams({
      auth: token,
      ua: this.options.userAgent,
      projectId: this.options.projectId,
      useOnCloseEvent: 'true',
    });
    const socket = (this.options.createSocket ?? defaultSocket)(`${this.options.url}?${query.toString()}`);

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Relay connection failed'));
      socket.onclose = (event) => reject(new Error(`Relay closed the connection (${event?.code ?? 'no code'})`));
    }).catch((error) => {
      try {
        socket.close();
      } catch {
        /* never opened */
      }
      this.scheduleReconnect();
      throw error;
    });
    socket.onmessage = (event) => this.onFrame(socket, event.data);
    socket.onerror = () => undefined;
    socket.onclose = () => this.onClosed(socket);
    this.socket = socket;
    this.reconnectDelay = RECONNECT_MIN_MS;
    const topics = [...this.topics.keys()];

    for (const topic of topics) this.topics.set(topic, undefined);
    if (topics.length) {
      try {
        await this.subscribeOn(socket, topics);
      } catch (error) {
        // A socket that could not subscribe hears nothing; replace it.
        this.drop(socket);
        throw error;
      }
      // Messages held while no socket listened, including after a worker restart.
      void this.fetchMessages(topics).catch((error) => console.warn('WalletConnect relay fetch failed', error));
    }

    return socket;
  }

  private onFrame(socket: RelaySocket, data: unknown): void {
    if (typeof data !== 'string' || data.length > MAX_FRAME_CHARS) return;
    let payload: unknown;

    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (isJsonRpcRequest(payload)) {
      if (payload.method !== 'irn_subscription') return;
      // Acknowledge first: the relay keeps redelivering an unacknowledged message.
      try {
        socket.send(JSON.stringify(formatJsonRpcResult(payload.id, true)));
      } catch {
        /* the relay will deliver it again */
      }
      const params = payload.params as { data?: unknown } | undefined;
      const message = relayMessage(params?.data);

      if (message && this.topics.has(message.topic)) this.deliver(message);
      return;
    }
    if (isJsonRpcResponse(payload)) {
      const entry = this.pending.get(payload.id);

      if (!entry) return;
      this.pending.delete(payload.id);
      this.clearTimer(entry.timer);
      if ('error' in payload) entry.reject(new Error(payload.error.message || 'Relay request failed'));
      else entry.resolve(payload.result);
    }
  }

  private drop(socket: RelaySocket): void {
    try {
      socket.close();
    } catch {
      /* already closed */
    }
    this.onClosed(socket);
  }

  private onClosed(socket: RelaySocket): void {
    if (this.socket !== socket) return;
    this.socket = undefined;
    for (const topic of this.topics.keys()) this.topics.set(topic, undefined);
    this.failPending(new Error('Relay connection closed'));
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || !this.topics.size || this.reconnectTimer) return;
    const delay = this.reconnectDelay;

    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = undefined;
      if (this.closed || !this.topics.size) return;
      this.open().catch((error) => console.warn('WalletConnect relay reconnect failed', error));
    }, delay);
  }
}
