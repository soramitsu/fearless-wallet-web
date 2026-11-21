import { NetworkId } from '@iroha/iroha-js/browser';
import {
  createConnectAppSession,
  createConnectSessionPreview,
  type BrowserConnectSessionPreview,
} from '@iroha/iroha-js/connect-browser';
import {
  browserTransactionPayloadHashHex,
  buildBrowserExecutableBatchPayload,
  buildBrowserTransferPayload,
  finalizeBrowserSignedTransaction,
} from '@iroha/iroha-js/transaction-codec';
import { ed25519 } from '@noble/curves/ed25519';

import {
  IROHA_CONNECT_PROFILES,
  IrohaConnectService,
  decodeIrohaConnectFrame,
  encodeIrohaConnectPingFrame,
  toBase64Url,
  type IrohaConnectSocket,
} from '@extension-base/services/iroha-connect-service';
import { UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';
import { encodeIrohaI105Address } from '@/util/iroha';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TAIRA = IROHA_CONNECT_PROFILES.taira;
const XOR = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.nativeAsset.id;
const CONTRACT = 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw';
const TOKEN_APP = toBase64Url(new Uint8Array(32).fill(0x51));
const TOKEN_WALLET = toBase64Url(new Uint8Array(32).fill(0x52));
const TOKEN_RELAY = toBase64Url(new Uint8Array(32).fill(0x53));
const OTHER_ACCOUNT = encodeIrohaI105Address(
  Buffer.from(ed25519.getPublicKey(new Uint8Array(32).fill(0x0b))).toString('hex'),
  'taira'
);

const settle = async (): Promise<void> => {
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
};

/** Stands in for Torii: buffers app frames until the wallet joins, then forwards each side's frames. */
class Relay {
  app?: AppSocket;
  wallet?: WalletSocket;
  readonly walletFrames: Uint8Array[] = [];
  private readonly forWallet: Uint8Array[] = [];

  toWallet(bytes: Uint8Array): void {
    if (!this.wallet) {
      this.forWallet.push(bytes);
      return;
    }
    const socket = this.wallet;
    queueMicrotask(() => socket.onmessage?.({ data: bytes.slice().buffer }));
  }

  attachWallet(socket: WalletSocket): void {
    this.wallet = socket;
    for (const frame of this.forWallet.splice(0)) this.toWallet(frame);
  }

  toApp(bytes: Uint8Array): void {
    this.walletFrames.push(bytes.slice());
    const app = this.app;
    if (app) queueMicrotask(() => app.dispatch('message', { data: bytes.slice().buffer }));
  }
}

let relay: Relay;

class AppSocket {
  binaryType = 'arraybuffer';
  readyState = 0;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(
    readonly url: string,
    readonly protocols: string[]
  ) {
    relay.app = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.dispatch('open', {});
    });
  }

  addEventListener(name: string, listener: (event: unknown) => void): void {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  dispatch(name: string, event: unknown): void {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }

  send(data: Uint8Array): void {
    relay.toWallet(new Uint8Array(data));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatch('close', {});
  }
}

class WalletSocket implements IrohaConnectSocket {
  binaryType = '';
  readyState = 1;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: ((event?: unknown) => void) | null = null;
  readonly textSent: string[] = [];
  readonly close = vi.fn(() => {
    this.readyState = 3;
  });

  send(data: string | Uint8Array): void {
    if (typeof data === 'string') this.textSent.push(data);
    else relay.toApp(data);
  }
}

const walletUriFor = (preview: BrowserConnectSessionPreview): string =>
  `iroha://connect?${new URLSearchParams({
    sid: preview.sidBase64Url,
    network_id: TAIRA.networkId!,
    app_pk: toBase64Url(preview.appKeyPair.publicKey),
    nonce: toBase64Url(preview.nonce),
    node: TAIRA.toriiBaseUrl,
    v: '1',
    role: 'wallet',
    token: TOKEN_WALLET,
    relay: TOKEN_RELAY,
  }).toString()}`;

type Permissions = { methods: string[]; events?: string[]; resources?: string[] | null } | null;

const createHarness = ({ permissions = { methods: ['sign_transaction'], events: [] } }: { permissions?: Permissions } = {}) => {
  relay = new Relay();
  const derived = deriveIrohaSigningKey({ mnemonic: MNEMONIC });
  const accountId = encodeIrohaI105Address(derived.publicKeyHex, 'taira');
  const storedAccount = {
    address: 'stored-iroha-account',
    meta: {
      irohaPublicKeyHex: derived.publicKeyHex,
      name: 'Sakura',
      walletEcosystem: WalletEcosystem.Iroha,
      walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION as number | undefined,
    },
  };
  const keyringService = {
    accountSubject: { value: { primary: { json: { address: storedAccount.address, meta: storedAccount.meta }, type: 'ed25519' } } },
    addressSubject: { value: {} },
    exportMnemonic: vi.fn(() => ({ seed: MNEMONIC })),
    getAccounts: vi.fn(() => [storedAccount]),
    keyringIsLocked: false,
  };
  const socket = new WalletSocket();
  const createSocket = vi.fn(() => {
    relay.attachWallet(socket);
    return socket;
  });
  const onStateChange = vi.fn();
  const service = new IrohaConnectService({ keyringService } as never, { createSocket, onStateChange });

  const preview = createConnectSessionPreview({ networkId: NetworkId.parse(TAIRA.networkId!), node: TAIRA.toriiBaseUrl });
  const app = createConnectAppSession({
    baseUrl: TAIRA.toriiBaseUrl,
    preview,
    session: { sid: preview.sidBase64Url, token_app: TOKEN_APP, token_relay: TOKEN_RELAY },
    webSocketImpl: AppSocket as never,
    appMeta: { name: 'Hanami Market', url: 'https://hanami.example/market' },
    permissions,
  } as never);
  // The SDK settles approval asynchronously; observe failures so a test that expects one does not leak it.
  const approval = app.waitForApproval();
  approval.catch(() => undefined);

  return { accountId, app, approval, createSocket, derived, keyringService, onStateChange, preview, service, socket, storedAccount };
};

const connectAndApprove = async (options?: { permissions?: Permissions }) => {
  const harness = createHarness(options);
  await settle();
  harness.service.connect(walletUriFor(harness.preview));
  await settle();
  await harness.service.approveSession(harness.accountId);
  await settle();
  return harness;
};

const feePayment = (gasLimit: string | null = null) => ({
  payer: 'authority' as const,
  chargeLimits: [{ kind: 'nexus' as const, assetDefinitionId: XOR, maxAmount: '0.25' }],
  gasLimit,
});

const transferPayload = (authority: string, overrides: Record<string, unknown> = {}): Uint8Array =>
  new Uint8Array(
    buildBrowserTransferPayload({
      networkId: NetworkId.parse(TAIRA.networkId!),
      networkPrefix: TAIRA.networkPrefix,
      authority,
      sourceAssetHoldingId: `${XOR}#${authority}`,
      quantity: '1.5',
      destinationAccountId: OTHER_ACCOUNT,
      feePayment: feePayment(),
      metadata: { memo: 'hanami' },
      creationTimeMs: 1_795_000_000_000,
      ttlMs: 100_000,
      ...overrides,
    } as never)
  );

const contractPayload = (authority: string): Uint8Array =>
  new Uint8Array(
    buildBrowserExecutableBatchPayload({
      networkId: NetworkId.parse(TAIRA.networkId!),
      networkPrefix: TAIRA.networkPrefix,
      authority,
      entries: [
        {
          kind: 'contractCall',
          contractAddress: CONTRACT,
          expectedCodeHash: `${'ab'.repeat(31)}a1`,
          entrypoint: 'place_order',
          arguments: Uint8Array.of(1, 2, 3, 4),
        },
      ],
      feePayment: feePayment('50000'),
      creationTimeMs: 1_795_000_000_000,
      ttlMs: 100_000,
    } as never)
  );

describe('IrohaConnectService (current v1 protocol, against the iroha-js app SDK)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the relay with the wallet token and shows the dApp Open for approval', async () => {
    const { accountId, createSocket, preview, service, socket } = createHarness({
      permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: null },
    });
    await settle();

    expect(service.connect(walletUriFor(preview))).toMatchObject({ phase: 'connecting', accounts: [] });
    expect(createSocket).toHaveBeenCalledWith(
      `wss://taira.sora.org/v1/connect/ws?sid=${preview.sidBase64Url}&role=wallet`,
      [`iroha-connect.token.v1.${toBase64Url(new TextEncoder().encode(TOKEN_WALLET))}`]
    );
    expect(socket.binaryType).toBe('arraybuffer');
    await settle();

    expect(service.snapshot).toMatchObject({
      phase: 'session-approval',
      accounts: [{ address: accountId, name: 'Sakura', network: 'taira' }],
      session: {
        appName: 'Hanami Market',
        appUrl: 'https://hanami.example/market',
        network: 'taira',
        networkId: TAIRA.networkId,
        permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: null },
        protocol: 'iroha-connect-v1',
      },
    });
    expect(relay.walletFrames).toHaveLength(0);
  });

  it('approves with a signature and session key the app SDK verifies', async () => {
    const { accountId, approval, service } = await connectAndApprove();

    expect(service.snapshot).toMatchObject({ phase: 'connected', selectedAccountId: accountId });
    await expect(approval).resolves.toMatchObject({ accountId });
  });

  it('reviews a transfer, then returns the transaction signature only after approval', async () => {
    const { accountId, app, derived, onStateChange, service } = await connectAndApprove();
    const payload = transferPayload(accountId);
    const signature = app.signTransaction(payload);
    await settle();

    expect(service.snapshot.phase).toBe('request-approval');
    expect(onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'request-approval' }),
      expect.objectContaining({ phase: 'connected' })
    );
    const request = service.snapshot.request!;
    expect(request).toMatchObject({
      accountId,
      kind: 'transaction',
      review: {
        kind: 'transfer',
        authority: accountId,
        networkId: TAIRA.networkId,
        payloadBytes: payload.length,
        payloadHashHex: browserTransactionPayloadHashHex(payload, TAIRA.networkPrefix),
        ttlMs: '100000',
        metadata: '{"memo":"hanami"}',
        fee: { payer: 'authority', gasLimit: null, chargeLimits: [{ kind: 'nexus', maxAmount: '0.25', asset: { definitionId: XOR, symbol: 'XOR' } }] },
        transfer: { asset: { definitionId: XOR, symbol: 'XOR' }, quantity: '1.5', destination: OTHER_ACCOUNT, scope: null },
      },
    });
    expect(request.expiresAt - request.createdAt).toBe(120_000);
    expect(JSON.stringify(service.snapshot)).not.toContain(MNEMONIC.split(' ')[0] + ' ' + MNEMONIC.split(' ')[1]);

    service.approveRequest(request.requestId);
    await settle();
    const signed = await signature;

    const hash = Buffer.from(browserTransactionPayloadHashHex(payload, TAIRA.networkPrefix), 'hex');
    expect(ed25519.verify(signed, hash, derived.publicKeyHex)).toBe(true);
    const finalized = finalizeBrowserSignedTransaction(
      {
        networkId: NetworkId.parse(TAIRA.networkId!),
        networkPrefix: TAIRA.networkPrefix,
        payloadBytes: payload,
        authority: accountId,
        signatureAlgorithm: 'ed25519',
      },
      signed,
      derived.publicKeyHex
    );
    expect(finalized.hashHex).toMatch(/^[0-9a-f]{64}$/u);
    expect(service.snapshot).toMatchObject({ phase: 'connected', request: undefined });
  });

  it('reviews contract calls with their entrypoint, code hash and argument digest', async () => {
    const { accountId, app, derived, service } = await connectAndApprove();
    const payload = contractPayload(accountId);
    const signature = app.signTransaction(payload);
    await settle();

    expect(service.snapshot.request?.review).toMatchObject({
      kind: 'contract-calls',
      fee: { gasLimit: '50000' },
      calls: [
        {
          contractAddress: CONTRACT,
          entrypoint: 'place_order',
          codeHashHex: `${'ab'.repeat(31)}a1`,
          argumentBytes: 4,
          argumentsSha256: Buffer.from(await crypto.subtle.digest('SHA-256', Uint8Array.of(1, 2, 3, 4))).toString('hex'),
        },
      ],
    });
    service.approveRequest(service.snapshot.request!.requestId);
    await settle();
    const hash = Buffer.from(browserTransactionPayloadHashHex(payload, TAIRA.networkPrefix), 'hex');
    expect(ed25519.verify(await signature, hash, derived.publicKeyHex)).toBe(true);
  });

  it('answers a rejection, an expiry and a closed session without signing', async () => {
    const { accountId, app, service } = await connectAndApprove();

    const rejected = expect(app.signTransaction(transferPayload(accountId))).rejects.toMatchObject({
      code: 'USER_REJECTED',
    });
    await settle();
    service.rejectRequest(service.snapshot.request!.requestId);
    await rejected;

    const expired = expect(app.signTransaction(transferPayload(accountId))).rejects.toMatchObject({
      code: 'REQUEST_EXPIRED',
    });
    await settle();
    const requestId = service.snapshot.request!.requestId;
    vi.advanceTimersByTime(120_001);
    await expired;
    expect(service.snapshot).toMatchObject({ phase: 'connected', notice: { code: 'request_expired' } });
    expect(() => service.approveRequest(requestId)).toThrow('That IrohaConnect action is not available.');

    const closed = expect(app.signTransaction(transferPayload(accountId))).rejects.toMatchObject({
      name: 'ConnectSessionClosedError',
    });
    await settle();
    service.disconnect();
    await closed;
    expect(service.snapshot).toEqual({ accounts: [], phase: 'idle' });
  });

  it.each([
    ['another account', () => transferPayload(OTHER_ACCOUNT), 'WRONG_ACCOUNT', 'transaction_wrong_account'],
    ['random bytes', () => Uint8Array.of(1, 2, 3, 4, 5), 'INVALID_TRANSACTION', 'transaction_invalid'],
  ])('refuses a transaction for %s without asking', async (_label, makePayload, code, notice) => {
    const { app, service } = await connectAndApprove();
    const result = expect(app.signTransaction(makePayload())).rejects.toMatchObject({ code });
    await settle();
    await result;
    expect(service.snapshot).toMatchObject({ phase: 'connected', notice: { code: notice } });
  });

  it('refuses payloads it cannot rebuild exactly', async () => {
    const { accountId, app, service } = await connectAndApprove();
    const payload = transferPayload(accountId);
    // Replace the trailing `attachments: None` field (compact length 1, tag 0) with a non-empty attachment field.
    const withAttachment = new Uint8Array([...payload.subarray(0, payload.length - 2), 2, 1, 0]);
    const unsupported = expect(app.signTransaction(withAttachment)).rejects.toMatchObject({
      code: 'UNSUPPORTED_TRANSACTION',
    });
    await settle();
    await unsupported;

    // A payload for another network (first NetworkId byte: compact domain length, u32 variant, compact length).
    const wrongNetwork = transferPayload(accountId).slice();
    wrongNetwork[1 + 4 + 1] ^= 0x02;
    const refused = expect(app.signTransaction(wrongNetwork)).rejects.toMatchObject({ code: 'WRONG_NETWORK' });
    await settle();
    await refused;
    expect(service.snapshot.phase).toBe('connected');
  });

  it('never signs raw requests with the account key', async () => {
    const { app, keyringService, service } = await connectAndApprove({
      permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: ['iroha:torii:canonical-request:v1'] },
    });
    keyringService.exportMnemonic.mockClear();
    const raw = expect(app.signRaw('iroha:torii:canonical-request:v1', Uint8Array.of(1, 2, 3))).rejects.toMatchObject({
      code: 'SIGNING_KEY_REQUIRED',
    });
    await settle();
    await raw;
    expect(keyringService.exportMnemonic).not.toHaveBeenCalled();
    expect(service.snapshot).toMatchObject({ phase: 'connected', notice: { code: 'raw_signing_unavailable' } });
  });

  it('refuses transactions a session did not ask to sign', async () => {
    const { accountId, app } = await connectAndApprove({
      permissions: { methods: ['sign_raw'], events: [], resources: ['iroha:torii:canonical-request:v1'] },
    });
    const result = expect(app.signTransaction(transferPayload(accountId))).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
    await settle();
    await result;
  });

  it('allows transactions when the Open frame declares no permissions', async () => {
    const { accountId, app, service } = await connectAndApprove({ permissions: null });
    void app.signTransaction(transferPayload(accountId)).catch(() => undefined);
    await settle();

    expect(service.snapshot.phase).toBe('request-approval');
  });

  it('keeps the worker alive with binary Connect pings that keep the session in sequence', async () => {
    const { accountId, app, service, socket } = await connectAndApprove();
    const before = relay.walletFrames.length;

    vi.advanceTimersByTime(20_000);
    await settle();
    vi.advanceTimersByTime(20_000);
    await settle();

    expect(socket.textSent).toEqual([]);
    const pings = relay.walletFrames.slice(before);
    expect(pings).toHaveLength(2);
    for (const frame of pings) {
      const decoded = decodeIrohaConnectFrame(frame, { sidBytes: frameSid(frame) });
      expect(decoded).toMatchObject({ kind: 'control', direction: 'wallet-to-app', control: { type: 'ping' } });
    }

    // The app SDK answered both pings; later wallet and app frames still line up.
    const signature = app.signTransaction(transferPayload(accountId));
    await settle();
    service.approveRequest(service.snapshot.request!.requestId);
    await expect(signature).resolves.toHaveLength(64);
  });

  it('answers an app ping with a pong', async () => {
    const { preview, service } = await connectAndApprove();
    const nextAppSequence = 2;
    const ping = encodeIrohaConnectPingFrame({ sidBytes: preview.sidBytes, sequence: nextAppSequence, nonce: 77n });
    ping[8 + 288 + 8] = 0; // app-to-wallet direction
    relay.toWallet(ping);
    await settle();

    const pong = decodeIrohaConnectFrame(relay.walletFrames.at(-1)!, { sidBytes: preview.sidBytes });
    expect(pong).toMatchObject({ kind: 'control', direction: 'wallet-to-app', control: { type: 'pong', nonce: 77n } });
    expect(service.snapshot.phase).toBe('connected');
  });

  it('returns to idle with a notice when the dApp closes the session', async () => {
    const { app, service } = await connectAndApprove();
    app.close('done');
    await settle();

    expect(service.snapshot).toMatchObject({ phase: 'idle', notice: { code: 'dapp_closed' } });
  });

  it('sends a protocol rejection when the person declines the connection', async () => {
    const { approval, preview, service } = createHarness();
    await settle();
    service.connect(walletUriFor(preview));
    await settle();

    const rejection = expect(approval).rejects.toMatchObject({
      name: 'ConnectApprovalRejectedError',
      codeId: 'user_rejected',
    });
    service.rejectSession();
    await rejection;
    expect(service.snapshot).toEqual({ accounts: [], phase: 'idle' });
  });

  it('does not sign an approval with a pre-update wallet or a locked keyring', async () => {
    const recovery = createHarness();
    recovery.storedAccount.meta.walletSecurityGeneration = undefined;
    await settle();
    recovery.service.connect(walletUriFor(recovery.preview));
    await settle();
    await expect(recovery.service.approveSession(recovery.accountId)).rejects.toThrow(/recovery-only/i);
    expect(recovery.keyringService.exportMnemonic).not.toHaveBeenCalled();
    expect(relay.walletFrames).toHaveLength(0);

    const locked = createHarness();
    locked.keyringService.keyringIsLocked = true;
    await settle();
    locked.service.connect(walletUriFor(locked.preview));
    await settle();
    await expect(locked.service.approveSession(locked.accountId)).rejects.toThrow('Unlock Fearless');
  });

  it('fails closed on frames from another session and on replays', async () => {
    const harness = createHarness();
    await settle();
    const otherPreview = createConnectSessionPreview({ networkId: NetworkId.parse(TAIRA.networkId!), node: TAIRA.toriiBaseUrl });
    harness.service.connect(walletUriFor(otherPreview));
    await settle();
    expect(harness.service.snapshot).toMatchObject({ phase: 'error', error: 'iroha_connect_invalid_frame' });

    const replay = await connectAndApprove();
    const ping = encodeIrohaConnectPingFrame({ sidBytes: replay.preview.sidBytes, sequence: 1, nonce: 1n });
    ping[8 + 288 + 8] = 0;
    relay.toWallet(ping);
    await settle();
    expect(replay.service.snapshot).toMatchObject({ phase: 'error', error: 'The dApp replayed an IrohaConnect frame.' });
  });

  it('calls the browser timer functions with their own receiver', async () => {
    vi.useRealTimers();
    const realSetTimeout = globalThis.setTimeout;
    const realClearTimeout = globalThis.clearTimeout;
    // Chrome throws "Illegal invocation" when setTimeout or clearTimeout runs with a foreign `this`.
    const strict = <T extends (...args: never[]) => unknown>(real: T) =>
      function (this: unknown, ...args: Parameters<T>) {
        if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
        return real(...args);
      };
    vi.stubGlobal('setTimeout', strict(realSetTimeout as never));
    vi.stubGlobal('clearTimeout', strict(realClearTimeout as never));
    try {
      const { approval, accountId, preview, service } = createHarness();
      await settle();
      expect(service.connect(walletUriFor(preview)).phase).toBe('connecting');
      await settle();
      expect(service.snapshot.phase).toBe('session-approval');
      await service.approveSession(accountId);
      await expect(approval).resolves.toMatchObject({ accountId });
      service.disconnect();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('times out when the dApp never opens the session', () => {
    relay = new Relay();
    const socket = new WalletSocket();
    const service = new IrohaConnectService({ keyringService: { accountSubject: { value: {} } } } as never, {
      createSocket: () => socket,
    });
    const preview = createConnectSessionPreview({ networkId: NetworkId.parse(TAIRA.networkId!), node: TAIRA.toriiBaseUrl });
    service.connect(walletUriFor(preview));
    vi.advanceTimersByTime(20_001);

    expect(service.snapshot).toMatchObject({ phase: 'error', error: 'The IrohaConnect dApp did not open the session in time.' });
    expect(socket.close).toHaveBeenCalled();
  });
});

function frameSid(frame: Uint8Array): Uint8Array {
  const sid = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) sid[index] = frame[8 + index * 9 + 8];
  return sid;
}
