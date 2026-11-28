import type { RelaySocket } from '@extension-base/services/wallet-connect-service/protocol/relay';

// An in-memory WalletConnect relay with the delivery rules the live relay showed: a message reaches every other
// subscriber of its topic; with none, the relay holds it and hands it to the first one that subscribes or fetches.
// Each held message is delivered once. Requests and acknowledgements are JSON-RPC, as on the wire.

type Held = { topic: string; message: string; publishedAt: number; tag: number };

export class FakeRelaySocket implements RelaySocket {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: unknown[] = [];

  constructor(
    private readonly relay: FakeWalletConnectRelay,
    readonly url: string
  ) {}

  open(): void {
    if (this.readyState !== 0) return;
    this.readyState = 1;
    this.onopen?.({});
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('socket is not open');
    const payload = JSON.parse(data);

    this.sent.push(payload);
    setTimeout(() => this.relay.handle(this, payload), 0);
  }

  receive(payload: unknown): void {
    if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(payload) });
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.relay.dropSocket(this);
    this.onclose?.({ code, reason });
  }
}

export class FakeWalletConnectRelay {
  readonly sockets = new Set<FakeRelaySocket>();
  readonly published: (Held & { ttl: number; prompt?: boolean })[] = [];
  private readonly subscribers = new Map<string, Set<FakeRelaySocket>>();
  private readonly held = new Map<string, Held[]>();
  private nextSubscription = 1;
  private nextDelivery = 1;
  /** When false, sockets stay connecting: the relay is unreachable. */
  reachable = true;

  readonly createSocket = (url: string): FakeRelaySocket => {
    const socket = new FakeRelaySocket(this, url);

    this.sockets.add(socket);
    if (this.reachable) setTimeout(() => socket.open(), 0);
    else setTimeout(() => socket.close(1006, 'unreachable'), 0);

    return socket;
  };

  /** Connection URLs carry the sign-in token and the project. */
  get urls(): string[] {
    return [...this.sockets].map((socket) => socket.url);
  }

  dropSocket(socket: FakeRelaySocket): void {
    this.sockets.delete(socket);
    for (const set of this.subscribers.values()) set.delete(socket);
  }

  /** Closes every connection, as a relay restart or a network change does. */
  disconnectAll(): void {
    for (const socket of [...this.sockets]) socket.close(1006, 'relay restart');
  }

  heldFor(topic: string): number {
    return this.held.get(topic)?.length ?? 0;
  }

  private reply(socket: FakeRelaySocket, id: number, result: unknown): void {
    socket.receive({ id, jsonrpc: '2.0', result });
  }

  private subscribe(socket: FakeRelaySocket, topic: string): string {
    let set = this.subscribers.get(topic);

    if (!set) {
      set = new Set();
      this.subscribers.set(topic, set);
    }
    set.add(socket);
    const held = this.held.get(topic) ?? [];

    this.held.delete(topic);
    for (const message of held) this.deliver(socket, message);

    return `subscription-${this.nextSubscription++}`;
  }

  private deliver(socket: FakeRelaySocket, message: Held): void {
    setTimeout(
      () =>
        socket.receive({
          id: this.nextDelivery++,
          jsonrpc: '2.0',
          method: 'irn_subscription',
          params: { id: 'subscription', data: message },
        }),
      0
    );
  }

  handle(socket: FakeRelaySocket, payload: { id: number; method?: string; params?: Record<string, unknown> }): void {
    if (!payload.method) return; // an acknowledgement of a delivery
    const params = payload.params ?? {};

    switch (payload.method) {
      case 'irn_subscribe':
        return this.reply(socket, payload.id, this.subscribe(socket, params.topic as string));
      case 'irn_batchSubscribe':
        return this.reply(
          socket,
          payload.id,
          (params.topics as string[]).map((topic) => this.subscribe(socket, topic))
        );
      case 'irn_unsubscribe':
        this.subscribers.get(params.topic as string)?.delete(socket);
        return this.reply(socket, payload.id, true);
      case 'irn_batchFetchMessages': {
        const messages = (params.topics as string[]).flatMap((topic) => {
          const held = this.held.get(topic) ?? [];

          this.held.delete(topic);
          return held;
        });

        return this.reply(socket, payload.id, { messages, hasMore: false });
      }
      case 'irn_publish': {
        const message: Held = {
          topic: params.topic as string,
          message: params.message as string,
          publishedAt: Date.now(),
          tag: params.tag as number,
        };

        this.published.push({ ...message, ttl: params.ttl as number, prompt: params.prompt as boolean | undefined });
        const others = [...(this.subscribers.get(message.topic) ?? [])].filter((entry) => entry !== socket);

        if (others.length) for (const other of others) this.deliver(other, message);
        else this.held.set(message.topic, [...(this.held.get(message.topic) ?? []), message]);

        return this.reply(socket, payload.id, true);
      }
      default:
        return socket.receive({ id: payload.id, jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' } });
    }
  }
}

/** A storage like chrome.storage.local: JSON values, read back as copies. */
export function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map<string, string>(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));

  return {
    data,
    async getItem<T = unknown>(key: string): Promise<T | undefined> {
      const value = data.get(key);

      return value === undefined ? undefined : (JSON.parse(value) as T);
    },
    async setItem<T = unknown>(key: string, value: T): Promise<void> {
      data.set(key, JSON.stringify(value));
    },
    read<T = unknown>(key: string): T | undefined {
      const value = data.get(key);

      return value === undefined ? undefined : (JSON.parse(value) as T);
    },
  };
}

/** A Verify service that knows nothing: every message stays UNKNOWN. */
export const offlineVerify = async () => ({ status: 404, json: async () => undefined });
