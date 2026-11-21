import { ed25519 } from '@noble/curves/ed25519';
import { BehaviorSubject } from 'rxjs';
import { transformIrohaAccounts } from '@extension-base/background/helpers/accounts';
import { exportUniversalWalletSecret } from '@extension-base/services/keyring-service/UniversalWalletPassword';
import {
  IrohaConnectTransactionError,
  reviewIrohaConnectTransaction,
  sanitizeIrohaConnectReviewText,
  type IrohaConnectTransactionErrorCode,
} from './transactionReview';
import {
  buildIrohaConnectApprovalPreimage,
  buildIrohaConnectWebSocket,
  bytesEqual,
  decodeIrohaConnectFrame,
  deriveIrohaConnectDirectionKeys,
  encodeIrohaConnectApproveFrame,
  encodeIrohaConnectPingFrame,
  encodeIrohaConnectPongFrame,
  encodeIrohaConnectRejectFrame,
  generateIrohaConnectWalletKeyPair,
  openIrohaConnectEnvelope,
  parseIrohaConnectUri,
  sealIrohaConnectEnvelope,
  type DecodedIrohaConnectControl,
  type DecodedIrohaConnectFrame,
  type IrohaConnectDirectionKeys,
  type IrohaConnectNetwork,
  type IrohaConnectPermissions,
  type IrohaConnectWalletPayload,
  type ParsedIrohaConnectUri,
} from './wire';
import {
  EMPTY_IROHA_CONNECT_SNAPSHOT,
  type IrohaConnectAccount,
  type IrohaConnectNoticeCode,
  type IrohaConnectSnapshot,
} from './types';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';
import { encodeIrohaI105Address, parseIrohaI105Address } from '@/util/iroha';
import { IS_EXTENSION } from '@/consts/global';
import { isRecoveryOnlyWallet } from '@/util/walletSecurity';
import { WALLET_RECOVERY_ONLY_ERROR } from '@/util/walletRecoveryPolicy';

export * from './wire';
export * from './types';
export type { IrohaConnectNetwork } from './types';
export { IrohaConnectTransactionError, reviewIrohaConnectTransaction } from './transactionReview';

const SIGNING_REQUEST_TTL_MS = 120_000;
const CONNECT_TIMEOUT_MS = 20_000;
// Chrome 116+ keeps an extension service worker alive while a WebSocket carries traffic at least every 30 s. Torii
// closes a Connect socket on any text frame, so the keepalive is a sequenced Connect Ping the dApp SDK answers.
const KEEP_ALIVE_INTERVAL_MS = 20_000;
const PUBLIC_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const SIGN_TRANSACTION_METHOD = 'sign_transaction';

type SocketEvent = { data: unknown };

export type IrohaConnectSocket = {
  binaryType: string;
  readyState: number;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onmessage: ((event: SocketEvent) => void) | null;
  onopen: ((event?: unknown) => void) | null;
  close(code?: number, reason?: string): void;
  send(data: string | Uint8Array): void;
};

type IrohaConnectServiceOptions = {
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  createSocket?: (url: string, protocols: string[]) => IrohaConnectSocket;
  makeRequestId?: () => string;
  makeWalletKeyPair?: () => { privateKey: Uint8Array; publicKey: Uint8Array };
  now?: () => number;
  onStateChange?: (snapshot: IrohaConnectSnapshot, previous: IrohaConnectSnapshot) => void;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
};

type PendingSignature = {
  accountId: string;
  expiresAt: number;
  payloadHash: Uint8Array;
  publicKeyHex: string;
  requestId: string;
  timer: ReturnType<typeof setTimeout>;
};

type ServiceSession = {
  /** Last accepted app-to-wallet sequence. */
  appSequence: number;
  keys?: IrohaConnectDirectionKeys;
  parsed: ParsedIrohaConnectUri;
  permissions: IrohaConnectPermissions | null;
  permissionsField?: Uint8Array;
  pingNonce: bigint;
  /** Last accepted Torii server-event sequence. */
  serverSequence: number;
  /** Next wallet-to-app sequence. */
  walletSequence: number;
};

const defaultCreateSocket = (url: string, protocols: string[]): IrohaConnectSocket =>
  new WebSocket(url, protocols) as unknown as IrohaConnectSocket;

const randomHex = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const normalizePublicKey = (value: string): string => value.replace(/^0x/iu, '').toLowerCase();

const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const normalizeAppUrl = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.username || url.password) return undefined;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) return undefined;
  return url.toString();
};

const NOTICE_FOR_REVIEW_ERROR: Record<IrohaConnectTransactionErrorCode, IrohaConnectNoticeCode> = {
  invalid_transaction: 'transaction_invalid',
  unsupported_transaction: 'transaction_unsupported',
  wrong_authority: 'transaction_wrong_account',
  wrong_network: 'transaction_invalid',
};

const RESULT_CODE_FOR_REVIEW_ERROR: Record<IrohaConnectTransactionErrorCode, string> = {
  invalid_transaction: 'INVALID_TRANSACTION',
  unsupported_transaction: 'UNSUPPORTED_TRANSACTION',
  wrong_authority: 'WRONG_ACCOUNT',
  wrong_network: 'WRONG_NETWORK',
};

export class IrohaConnectService {
  readonly stateSubject = new BehaviorSubject<IrohaConnectSnapshot>({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });

  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly createSocket: (url: string, protocols: string[]) => IrohaConnectSocket;
  private readonly makeRequestId: () => string;
  private readonly makeWalletKeyPair: () => { privateKey: Uint8Array; publicKey: Uint8Array };
  private readonly now: () => number;
  private readonly onStateChange: (snapshot: IrohaConnectSnapshot, previous: IrohaConnectSnapshot) => void;
  private readonly setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private generation = 0;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private keepAliveTimer?: ReturnType<typeof setTimeout>;
  private messageQueue: Promise<void> = Promise.resolve();
  private pendingSignature?: PendingSignature;
  private selectedAccount?: IrohaConnectAccount;
  private serviceSession?: ServiceSession;
  private socket?: IrohaConnectSocket;

  constructor(
    private readonly state: Pick<State, 'keyringService'>,
    options: IrohaConnectServiceOptions = {}
  ) {
    // Browsers throw "Illegal invocation" when the global timer functions run with another `this`, so the defaults
    // are wrappers, never the bare globals stored as methods.
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.makeRequestId = options.makeRequestId ?? (() => randomHex(16));
    this.makeWalletKeyPair = options.makeWalletKeyPair ?? generateIrohaConnectWalletKeyPair;
    this.now = options.now ?? (() => Date.now());
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
  }

  get snapshot(): IrohaConnectSnapshot {
    return this.stateSubject.value;
  }

  connect(uri: string): IrohaConnectSnapshot {
    const parsed = parseIrohaConnectUri(uri);
    this.closeSocket(false);

    const websocket = buildIrohaConnectWebSocket(parsed);
    const generation = ++this.generation;
    const socket = this.createSocket(websocket.url, websocket.protocols);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.serviceSession = {
      appSequence: 0,
      parsed,
      permissions: null,
      pingNonce: BigInt(`0x${randomHex(4)}`),
      serverSequence: 0,
      walletSequence: 1,
    };

    this.publish({
      accounts: [],
      phase: 'connecting',
      session: {
        appName: 'Iroha dApp',
        chainId: parsed.chainId,
        network: parsed.network,
        networkId: parsed.networkId,
        permissions: null,
        protocol: 'iroha-connect-v1',
        toriiBaseUrl: parsed.node,
      },
    });

    this.connectTimer = this.setTimer(() => {
      if (generation === this.generation && this.snapshot.phase === 'connecting') {
        this.fail('The IrohaConnect dApp did not open the session in time.');
      }
    }, CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      if (generation !== this.generation) socket.close(1000, 'Superseded session');
    };
    socket.onmessage = (event) => {
      this.messageQueue = this.messageQueue.then(() => this.onSocketMessage(event.data, generation));
    };
    socket.onerror = () => {
      if (generation === this.generation) this.fail('The IrohaConnect relay could not be reached.');
    };
    socket.onclose = () => {
      if (generation !== this.generation || this.snapshot.phase === 'idle' || this.snapshot.phase === 'error') return;
      this.fail('The IrohaConnect session ended.');
    };

    return this.snapshot;
  }

  async approveSession(accountId: string): Promise<IrohaConnectSnapshot> {
    const session = this.requireSession('session-approval');
    const account = this.snapshot.accounts.find(({ address }) => address === accountId);
    if (!account) throw new Error('Choose an available Iroha account.');
    if (!session.permissionsField) throw new Error('The dApp has not opened the session.');

    const walletKeyPair = this.makeWalletKeyPair();
    let keys: IrohaConnectDirectionKeys | undefined;
    try {
      if (walletKeyPair.privateKey.length !== 32 || walletKeyPair.publicKey.length !== 32) {
        throw new Error('Unable to create the IrohaConnect session key.');
      }
      const preimage = buildIrohaConnectApprovalPreimage({
        sidBytes: session.parsed.sidBytes,
        networkIdBytes: session.parsed.networkIdBytes,
        appPublicKey: session.parsed.appPublicKey,
        walletPublicKey: walletKeyPair.publicKey,
        accountId,
        permissionsField: session.permissionsField,
        relayToken: session.parsed.relayToken,
      });
      // The approval stays with the account's controller key; its preimage is wallet-built, never dApp-chosen bytes.
      const signed = this.signForAccount(accountId, session.parsed.network, preimage);
      keys = deriveIrohaConnectDirectionKeys(
        walletKeyPair.privateKey,
        session.parsed.appPublicKey,
        session.parsed.sidBytes
      );
      this.send(
        encodeIrohaConnectApproveFrame({
          sidBytes: session.parsed.sidBytes,
          sequence: session.walletSequence,
          walletPublicKey: walletKeyPair.publicKey,
          accountId,
          permissionsField: session.permissionsField,
          signature: signed.signature,
        })
      );
      session.walletSequence += 1;
      session.keys = keys;
      keys = undefined;
      this.selectedAccount = account;
      this.publish({
        ...this.snapshot,
        error: undefined,
        notice: undefined,
        phase: 'connected',
        selectedAccountId: account.address,
        session: this.snapshot.session ? { ...this.snapshot.session, connectedAt: this.now() } : undefined,
      });
      this.scheduleKeepAlive();
    } finally {
      walletKeyPair.privateKey.fill(0);
      keys?.appKey.fill(0);
      keys?.walletKey.fill(0);
    }

    return this.snapshot;
  }

  rejectSession(): IrohaConnectSnapshot {
    const session = this.requireSession('session-approval');
    this.send(
      encodeIrohaConnectRejectFrame({
        sidBytes: session.parsed.sidBytes,
        sequence: session.walletSequence,
        code: 4_001,
        codeId: 'user_rejected',
        reason: 'The wallet user rejected the connection.',
      })
    );
    session.walletSequence += 1;
    this.closeSocket(true);

    return this.snapshot;
  }

  approveRequest(requestId: string): IrohaConnectSnapshot {
    const session = this.requireSession('request-approval');
    const pending = this.requirePendingRequest(requestId);
    if (pending.expiresAt <= this.now()) {
      this.expirePendingRequest(pending.requestId);
      throw new Error('The signature request expired.');
    }

    // A transaction signature covers the marked hash of the payload the person just reviewed, exactly as the
    // wallet's own transfers sign.
    const signed = this.signForAccount(pending.accountId, session.parsed.network, pending.payloadHash);
    if (signed.publicKeyHex !== pending.publicKeyHex) {
      throw new Error('The selected account does not match the reviewed transaction.');
    }
    this.sendEncrypted({ type: 'sign_result_ok', signature: signed.signature });
    this.clearPendingRequest();
    this.publishConnected();

    return this.snapshot;
  }

  rejectRequest(requestId: string): IrohaConnectSnapshot {
    const pending = this.requirePendingRequest(requestId);
    this.sendEncrypted({
      type: 'sign_result_err',
      code: 'USER_REJECTED',
      message: 'The wallet user rejected the transaction.',
    });
    if (this.pendingSignature?.requestId === pending.requestId) this.clearPendingRequest();
    this.publishConnected();

    return this.snapshot;
  }

  disconnect(): IrohaConnectSnapshot {
    const session = this.serviceSession;
    if (session && this.socket?.readyState === 1) {
      try {
        if (session.keys) {
          this.sendEncrypted({ type: 'control_close', code: 1_000, reason: 'The wallet disconnected.' });
        } else if (this.snapshot.phase === 'session-approval') {
          this.send(
            encodeIrohaConnectRejectFrame({
              sidBytes: session.parsed.sidBytes,
              sequence: session.walletSequence,
              code: 4_001,
              codeId: 'user_rejected',
              reason: 'The wallet user cancelled the connection.',
            })
          );
          session.walletSequence += 1;
        }
      } catch {
        // Closing the local socket remains safe if the peer cannot receive the final frame.
      }
    }
    this.closeSocket(true);

    return this.snapshot;
  }

  clearError(): IrohaConnectSnapshot {
    if (this.snapshot.phase === 'error') this.publish({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });
    else if (this.snapshot.error || this.snapshot.notice) {
      this.publish({ ...this.snapshot, error: undefined, notice: undefined });
    }

    return this.snapshot;
  }

  private async onSocketMessage(data: unknown, generation: number): Promise<void> {
    if (generation !== this.generation) return;

    let bytes: Uint8Array;
    if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
    else if (ArrayBuffer.isView(data)) bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
    else if (typeof Blob !== 'undefined' && data instanceof Blob) bytes = new Uint8Array(await data.arrayBuffer());
    else {
      this.fail('The relay sent a non-binary IrohaConnect frame.');
      return;
    }

    if (generation !== this.generation) return;

    try {
      const session = this.serviceSession;
      if (!session) throw new Error('The IrohaConnect session is unavailable.');
      const frame = decodeIrohaConnectFrame(bytes, { sidBytes: session.parsed.sidBytes });

      if (frame.kind === 'control' && frame.control.type === 'server_event') {
        // Torii numbers its own events independently of either peer.
        if (frame.sequence !== session.serverSequence + 1) throw new Error('The relay sent an out-of-order event.');
        session.serverSequence = frame.sequence;
        return;
      }
      if (frame.direction !== 'app-to-wallet') throw new Error('The relay sent a frame in the wrong direction.');
      if (frame.sequence <= session.appSequence) throw new Error('The dApp replayed an IrohaConnect frame.');
      if (frame.sequence !== session.appSequence + 1) throw new Error('The dApp sent an out-of-order frame.');
      if (session.appSequence === 0 && !(frame.kind === 'control' && frame.control.type === 'open')) {
        throw new Error('The dApp sent data before opening the session.');
      }
      session.appSequence = frame.sequence;

      if (frame.kind === 'control') this.handleControl(frame.control, session);
      else this.handleCiphertext(frame, session);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The dApp sent an invalid IrohaConnect frame.');
    }
  }

  private handleControl(control: DecodedIrohaConnectControl, session: ServiceSession): void {
    switch (control.type) {
      case 'open':
        this.handleOpen(control, session);
        return;
      case 'ping':
        this.send(
          encodeIrohaConnectPongFrame({
            sidBytes: session.parsed.sidBytes,
            sequence: session.walletSequence,
            nonce: control.nonce,
          })
        );
        session.walletSequence += 1;
        return;
      case 'pong':
        return;
      case 'close':
        this.endByDapp();
        return;
      default:
        throw new Error('The dApp sent an unsupported IrohaConnect control.');
    }
  }

  private handleOpen(control: Extract<DecodedIrohaConnectControl, { type: 'open' }>, session: ServiceSession): void {
    if (this.snapshot.phase !== 'connecting' || session.appSequence !== 1) {
      throw new Error('The dApp sent an unexpected Open frame.');
    }
    if (!bytesEqual(control.appPublicKey, session.parsed.appPublicKey)) {
      throw new Error('The Open frame does not match the IrohaConnect link.');
    }
    if (!bytesEqual(control.networkIdBytes, session.parsed.networkIdBytes)) {
      throw new Error('The Open frame is for a different network.');
    }

    session.permissions = control.permissions;
    session.permissionsField = control.permissionsField;
    if (this.connectTimer) {
      this.clearTimer(this.connectTimer);
      this.connectTimer = undefined;
    }

    this.publish({
      accounts: this.getAccounts(session.parsed.network),
      phase: 'session-approval',
      session: {
        appName: sanitizeIrohaConnectReviewText(control.appMeta?.name || 'Iroha dApp', 128),
        appUrl: normalizeAppUrl(control.appMeta?.url),
        chainId: session.parsed.chainId,
        network: session.parsed.network,
        networkId: session.parsed.networkId,
        permissions: control.permissions
          ? {
              methods: control.permissions.methods.map((value) => sanitizeIrohaConnectReviewText(value, 96)),
              events: control.permissions.events.map((value) => sanitizeIrohaConnectReviewText(value, 96)),
              resources:
                control.permissions.resources?.map((value) => sanitizeIrohaConnectReviewText(value, 160)) ?? null,
            }
          : null,
        protocol: 'iroha-connect-v1',
        toriiBaseUrl: session.parsed.node,
      },
    });
    this.scheduleKeepAlive();
  }

  private handleCiphertext(
    frame: Extract<DecodedIrohaConnectFrame, { kind: 'ciphertext' }>,
    session: ServiceSession
  ): void {
    if (
      !session.keys ||
      !this.selectedAccount ||
      (this.snapshot.phase !== 'connected' && this.snapshot.phase !== 'request-approval')
    ) {
      throw new Error('The dApp sent a request before wallet approval.');
    }

    const payload = openIrohaConnectEnvelope(session.keys.appKey, session.parsed.sidBytes, frame);
    switch (payload.type) {
      case 'sign_request_tx':
        this.handleTransactionRequest(payload.txBytes, session, this.selectedAccount);
        return;
      case 'sign_request_raw':
        // Raw requests are signed only by the account's registered off-chain signing key, inside the off-chain
        // envelope, so a dApp can never obtain a transaction signature this way. Fearless accounts have no such key
        // registered (no SDK can register one yet), so the request is refused without signing anything.
        this.refuse(
          'SIGNING_KEY_REQUIRED',
          'This account has no registered off-chain signing key. Fearless never signs raw bytes with the account key.',
          'raw_signing_unavailable'
        );
        return;
      case 'control_close':
      case 'control_reject':
        this.endByDapp();
        return;
      default:
        return;
    }
  }

  private handleTransactionRequest(txBytes: Uint8Array, session: ServiceSession, account: IrohaConnectAccount): void {
    if (this.pendingSignature) {
      this.refuse('REQUEST_IN_FLIGHT', 'Another transaction is being reviewed.', 'request_in_progress');
      return;
    }
    if (session.permissions && !session.permissions.methods.includes(SIGN_TRANSACTION_METHOD)) {
      this.refuse('PERMISSION_DENIED', 'The session did not ask to sign transactions.', 'permission_denied');
      return;
    }

    let reviewed: ReturnType<typeof reviewIrohaConnectTransaction>;
    try {
      reviewed = reviewIrohaConnectTransaction(txBytes, {
        networkId: session.parsed.networkId,
        networkPrefix: session.parsed.networkPrefix,
        authority: account.address,
        signingPublicKeyHex: account.publicKeyHex,
      });
    } catch (error) {
      const code = error instanceof IrohaConnectTransactionError ? error.code : 'invalid_transaction';
      const detail = error instanceof IrohaConnectTransactionError ? error.detail : 'The transaction is invalid.';
      this.refuse(RESULT_CODE_FOR_REVIEW_ERROR[code], detail, NOTICE_FOR_REVIEW_ERROR[code]);
      return;
    } finally {
      txBytes.fill(0);
    }

    const createdAt = this.now();
    const expiresAt = createdAt + SIGNING_REQUEST_TTL_MS;
    const requestId = this.makeRequestId();
    const timer = this.setTimer(() => this.expirePendingRequest(requestId), SIGNING_REQUEST_TTL_MS);
    this.pendingSignature = {
      accountId: account.address,
      expiresAt,
      payloadHash: reviewed.payloadHash,
      publicKeyHex: account.publicKeyHex,
      requestId,
      timer,
    };
    this.publish({
      ...this.snapshot,
      error: undefined,
      notice: undefined,
      phase: 'request-approval',
      request: { accountId: account.address, createdAt, expiresAt, kind: 'transaction', requestId, review: reviewed.review },
    });
  }

  private refuse(code: string, message: string, notice: IrohaConnectNoticeCode): void {
    this.sendEncrypted({ type: 'sign_result_err', code, message: sanitizeIrohaConnectReviewText(message, 480) });
    this.publish({ ...this.snapshot, notice: { at: this.now(), code: notice } });
  }

  private endByDapp(): void {
    this.closeSocket(false);
    this.publish({ ...EMPTY_IROHA_CONNECT_SNAPSHOT, notice: { at: this.now(), code: 'dapp_closed' } });
  }

  private getAccounts(network: IrohaConnectNetwork): IrohaConnectAccount[] {
    const locallySignableAccounts = Object.fromEntries(
      Object.entries(this.state.keyringService.accountSubject.value).filter(([, account]) => {
        const meta = account.json.meta as FWKeyringMeta;

        return (
          Boolean(meta.walletEcosystem) && !meta.isExternal && !meta.isInjected && !meta.isHardware && !meta.isMobile
        );
      })
    );
    const accounts = transformIrohaAccounts({ accounts: locallySignableAccounts }, network);
    const unique = new Map<string, IrohaConnectAccount>();
    for (const account of accounts) {
      if (!unique.has(account.address)) {
        unique.set(account.address, {
          address: account.address,
          name: account.name,
          network,
          publicKeyHex: normalizePublicKey(account.publicKeyHex),
        });
      }
    }

    return [...unique.values()];
  }

  private signForAccount(
    accountId: string,
    network: IrohaConnectNetwork,
    message: Uint8Array
  ): { publicKeyHex: string; signature: Uint8Array } {
    if (this.state.keyringService.keyringIsLocked) throw new Error('Unlock Fearless before approving this request.');

    const parsed = parseIrohaI105Address(accountId, network);
    const expectedPublicKey = normalizePublicKey(parsed.publicKeyHex);
    const keyringAccount = this.state.keyringService.getAccounts().find(({ address, meta }) => {
      const typedMeta = meta as FWKeyringMeta;
      if (PUBLIC_KEY_PATTERN.test(typedMeta.irohaPublicKeyHex ?? '')) {
        return normalizePublicKey(typedMeta.irohaPublicKeyHex!) === expectedPublicKey;
      }

      const candidate = typedMeta.irohaAddress || (typedMeta.walletEcosystem === WalletEcosystem.Iroha ? address : '');
      if (!candidate) return false;
      try {
        return normalizePublicKey(parseIrohaI105Address(candidate).publicKeyHex) === expectedPublicKey;
      } catch {
        return false;
      }
    });
    if (!keyringAccount) throw new Error('The selected Iroha account is no longer available.');

    const meta = keyringAccount.meta as FWKeyringMeta;
    if (IS_EXTENSION && isRecoveryOnlyWallet(meta)) throw new Error(WALLET_RECOVERY_ONLY_ERROR);
    if (!meta.walletEcosystem) throw new Error('The selected account cannot export Iroha signing material.');
    const { seed, passphrase } = exportUniversalWalletSecret(
      this.state.keyringService,
      { address: keyringAccount.address, walletEcosystem: meta.walletEcosystem },
      'iroha',
      meta
    );
    if (!seed) throw new Error('The selected account cannot be unlocked for signing.');

    const derived = deriveIrohaSigningKey({ mnemonic: seed, passphrase });
    try {
      const publicKeyHex = normalizePublicKey(derived.publicKeyHex);
      if (publicKeyHex !== expectedPublicKey || encodeIrohaI105Address(publicKeyHex, network) !== accountId) {
        throw new Error('The selected account does not match its derived Iroha key.');
      }

      return { publicKeyHex, signature: ed25519.sign(message, derived.privateKeySeed) };
    } finally {
      derived.privateKeySeed.fill(0);
    }
  }

  private requireSession(expectedPhase?: IrohaConnectSnapshot['phase']): ServiceSession {
    if (!this.serviceSession || !this.socket || this.socket.readyState !== 1) {
      throw new Error('The IrohaConnect session is not active.');
    }
    if (expectedPhase && this.snapshot.phase !== expectedPhase) {
      throw new Error('That IrohaConnect action is not available.');
    }

    return this.serviceSession;
  }

  private requirePendingRequest(requestId: string): PendingSignature {
    if (!this.pendingSignature || this.pendingSignature.requestId !== requestId) {
      throw new Error('The signature request is no longer available.');
    }

    return this.pendingSignature;
  }

  private send(frame: Uint8Array): void {
    if (!this.socket || this.socket.readyState !== 1) throw new Error('The IrohaConnect relay is not connected.');
    this.socket.send(frame);
  }

  private sendEncrypted(payload: IrohaConnectWalletPayload): void {
    const session = this.requireSession();
    if (!session.keys) throw new Error('The IrohaConnect session is not approved.');
    this.send(
      sealIrohaConnectEnvelope({
        walletKey: session.keys.walletKey,
        sidBytes: session.parsed.sidBytes,
        sequence: session.walletSequence,
        payload,
      })
    );
    session.walletSequence += 1;
  }

  private expirePendingRequest(requestId: string): void {
    if (!this.pendingSignature || this.pendingSignature.requestId !== requestId) return;
    try {
      this.sendEncrypted({
        type: 'sign_result_err',
        code: 'REQUEST_EXPIRED',
        message: 'The wallet approval timed out.',
      });
    } catch {
      // The socket close path below clears the same request.
    }
    this.clearPendingRequest();
    if (this.socket?.readyState === 1) {
      this.publish({
        ...this.snapshot,
        phase: 'connected',
        request: undefined,
        notice: { at: this.now(), code: 'request_expired' },
      });
    }
  }

  private scheduleKeepAlive(): void {
    if (this.keepAliveTimer) this.clearTimer(this.keepAliveTimer);
    const generation = this.generation;

    this.keepAliveTimer = this.setTimer(() => {
      this.keepAliveTimer = undefined;
      const session = this.serviceSession;
      if (
        generation !== this.generation ||
        !session ||
        this.socket?.readyState !== 1 ||
        (this.snapshot.phase !== 'session-approval' &&
          this.snapshot.phase !== 'connected' &&
          this.snapshot.phase !== 'request-approval')
      ) {
        return;
      }

      try {
        session.pingNonce = (session.pingNonce + 1n) & 0xffff_ffff_ffff_ffffn;
        this.send(
          encodeIrohaConnectPingFrame({
            sidBytes: session.parsed.sidBytes,
            sequence: session.walletSequence,
            nonce: session.pingNonce,
          })
        );
        session.walletSequence += 1;
        this.scheduleKeepAlive();
      } catch {
        this.fail('The IrohaConnect background keepalive failed.');
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  private clearPendingRequest(): void {
    if (!this.pendingSignature) return;
    this.clearTimer(this.pendingSignature.timer);
    this.pendingSignature.payloadHash.fill(0);
    this.pendingSignature = undefined;
  }

  private publishConnected(): void {
    this.publish({ ...this.snapshot, error: undefined, phase: 'connected', request: undefined });
  }

  private fail(message: string): void {
    const previous = this.snapshot;
    this.closeSocket(false);
    this.publish({
      accounts: [],
      error: message,
      phase: 'error',
      session: previous.session,
    });
  }

  private closeSocket(publishIdle: boolean): void {
    this.generation += 1;
    if (this.connectTimer) {
      this.clearTimer(this.connectTimer);
      this.connectTimer = undefined;
    }
    if (this.keepAliveTimer) {
      this.clearTimer(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
    this.clearPendingRequest();
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      try {
        socket.close(1_000, 'Wallet session closed');
      } catch {
        // The transport may already be closed.
      }
    }
    const session = this.serviceSession;
    if (session?.keys) {
      session.keys.appKey.fill(0);
      session.keys.walletKey.fill(0);
      session.keys = undefined;
    }
    this.serviceSession = undefined;
    this.selectedAccount = undefined;
    if (publishIdle) this.publish({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });
  }

  private publish(snapshot: IrohaConnectSnapshot): void {
    const previous = this.snapshot;
    this.stateSubject.next(snapshot);
    try {
      this.onStateChange(snapshot, previous);
    } catch (error) {
      console.error('Unable to update the IrohaConnect request UI.', error);
    }
  }
}
