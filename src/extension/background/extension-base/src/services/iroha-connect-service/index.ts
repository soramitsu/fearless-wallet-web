import { ed25519, x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { base64Decode, base64Encode } from '@polkadot/util-crypto';
import { BehaviorSubject } from 'rxjs';
import { transformIrohaAccounts } from '@extension-base/background/helpers/accounts';
import {
  buildLegacyIrohaConnectApprovalPreimage,
  buildLegacyIrohaConnectWebSocket,
  decodeLegacyIrohaConnectFrame,
  encodeLegacyIrohaConnectApproveFrame,
  encodeLegacyIrohaConnectCiphertextFrame,
  encodeLegacyIrohaConnectCloseFrame,
  encodeLegacyIrohaConnectPongFrame,
  encodeLegacyIrohaConnectRejectFrame,
  parseLegacyIrohaConnectUri,
  type DecodedLegacyIrohaConnectOpenFrame,
  type LegacyIrohaConnectNetwork,
  type ParsedLegacyIrohaConnectUri,
} from './legacyWire';
import {
  EMPTY_IROHA_CONNECT_SNAPSHOT,
  type IrohaConnectAccount,
  type IrohaConnectSnapshot,
  type IrohaConnectSigningRequest,
} from './types';
import type State from '@extension-base/background/handlers/State';
import type { FWKeyringMeta } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { deriveIrohaSigningKey } from '@/util/irohaKeyring';
import { encodeIrohaI105Address, parseIrohaI105Address } from '@/util/iroha';

export * from './legacyWire';
export * from './types';

const CONTRACT_SIGNATURE_SCHEMA = 'uranai.irohaconnect.contract-call-signature.v1';
const PRIVATE_TRADE_PROOF_SCHEMA = 'uranai.irohaconnect.private-trade-proof.v1';
const SIGNING_REQUEST_TTL_MS = 90_000;
const CONNECT_TIMEOUT_MS = 20_000;
const KEEP_ALIVE_INTERVAL_MS = 20_000;
const KEEP_ALIVE_MESSAGE = 'keepalive';
const MAX_SIGNING_MESSAGE_BYTES = 32_768;
const MAX_JSON_FIELD_BYTES = 2_048;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PUBLIC_KEY_PATTERN = /^(?:0x)?[0-9a-fA-F]{64}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const textEncoder = new TextEncoder();
const strictTextDecoder = new TextDecoder('utf-8', { fatal: true });

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
  makeWalletKeyPair?: () => { privateKey: Uint8Array; publicKey: Uint8Array };
  now?: () => number;
  onStateChange?: (snapshot: IrohaConnectSnapshot, previous: IrohaConnectSnapshot) => void;
  setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
};

type ContractSignaturePayload = {
  accountId: string;
  contractAddress?: string;
  contractAlias?: string;
  creationTimeMs?: number;
  entrypoint?: string;
  kind: 'contract_call_signature_request';
  requestId: string;
  schema: typeof CONTRACT_SIGNATURE_SCHEMA;
  signingMessage: Uint8Array;
};

type PendingSignature = ContractSignaturePayload & {
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
};

type ServiceSession = {
  appPublicKey: Uint8Array;
  appSequence: number;
  parsed: ParsedLegacyIrohaConnectUri;
  walletSequence: number;
};

const defaultCreateSocket = (url: string, protocols: string[]): IrohaConnectSocket =>
  new WebSocket(url, protocols) as unknown as IrohaConnectSocket;

const defaultMakeWalletKeyPair = (): { privateKey: Uint8Array; publicKey: Uint8Array } => {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);

  return { privateKey, publicKey };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizePublicKey = (value: string): string => value.replace(/^0x/iu, '').toLowerCase();

const bytesToHex = (value: Uint8Array): string =>
  Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');

const containsControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;

    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const isLoopback = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';

const normalizeAppUrl = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The dApp supplied an invalid URL.');
  }

  if (
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname)))
  ) {
    throw new Error('The dApp URL must use HTTPS.');
  }

  return url.toString();
};

const readDisplayField = (value: unknown, label: string, maximum = MAX_JSON_FIELD_BYTES): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.length === 0 || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (textEncoder.encode(value).length > maximum || containsControlCharacter(value)) {
    throw new Error(`${label} is too long or contains control characters.`);
  }

  return value;
};

const decodeSigningMessage = (value: unknown): Uint8Array => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > Math.ceil(MAX_SIGNING_MESSAGE_BYTES / 3) * 4 ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new Error('The signing payload is not canonical base64.');
  }

  const bytes = base64Decode(value);
  if (bytes.length === 0 || bytes.length > MAX_SIGNING_MESSAGE_BYTES || base64Encode(bytes) !== value) {
    throw new Error('The signing payload is invalid or too large.');
  }

  return bytes;
};

const parseContractSignaturePayload = (value: Record<string, unknown>): ContractSignaturePayload => {
  if (value.schema !== CONTRACT_SIGNATURE_SCHEMA || value.kind !== 'contract_call_signature_request') {
    throw new Error('Unsupported IrohaConnect request.');
  }
  if (typeof value.requestId !== 'string' || !REQUEST_ID_PATTERN.test(value.requestId)) {
    throw new Error('The signing request ID is invalid.');
  }

  const accountId = readDisplayField(value.accountId, 'accountId', 1_024);
  if (!accountId) throw new Error('The signing request is missing accountId.');

  let creationTimeMs: number | undefined;
  if (value.creationTimeMs !== undefined) {
    if (!Number.isSafeInteger(value.creationTimeMs) || (value.creationTimeMs as number) < 0) {
      throw new Error('The contract creation time is invalid.');
    }
    creationTimeMs = value.creationTimeMs as number;
  }

  return {
    schema: CONTRACT_SIGNATURE_SCHEMA,
    kind: 'contract_call_signature_request',
    requestId: value.requestId,
    accountId,
    signingMessage: decodeSigningMessage(value.signingMessageB64),
    contractAlias: readDisplayField(value.contractAlias, 'contractAlias', 256),
    contractAddress: readDisplayField(value.contractAddress, 'contractAddress', 512),
    entrypoint: readDisplayField(value.entrypoint, 'entrypoint', 256),
    creationTimeMs,
  };
};

export class IrohaConnectService {
  readonly stateSubject = new BehaviorSubject<IrohaConnectSnapshot>({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });

  private readonly clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly createSocket: (url: string, protocols: string[]) => IrohaConnectSocket;
  private readonly makeWalletKeyPair: () => { privateKey: Uint8Array; publicKey: Uint8Array };
  private readonly now: () => number;
  private readonly onStateChange: (snapshot: IrohaConnectSnapshot, previous: IrohaConnectSnapshot) => void;
  private readonly setTimer: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private generation = 0;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private keepAliveTimer?: ReturnType<typeof setTimeout>;
  private pendingSignature?: PendingSignature;
  private selectedAccount?: IrohaConnectAccount;
  private serviceSession?: ServiceSession;
  private socket?: IrohaConnectSocket;

  constructor(
    private readonly state: Pick<State, 'keyringService'>,
    options: IrohaConnectServiceOptions = {}
  ) {
    this.clearTimer = options.clearTimer ?? clearTimeout;
    this.createSocket = options.createSocket ?? defaultCreateSocket;
    this.makeWalletKeyPair = options.makeWalletKeyPair ?? defaultMakeWalletKeyPair;
    this.now = options.now ?? Date.now;
    this.onStateChange = options.onStateChange ?? (() => undefined);
    this.setTimer = options.setTimer ?? setTimeout;
  }

  get snapshot(): IrohaConnectSnapshot {
    return this.stateSubject.value;
  }

  connect(uri: string): IrohaConnectSnapshot {
    const parsed = parseLegacyIrohaConnectUri(uri);
    this.closeSocket(false);

    const websocket = buildLegacyIrohaConnectWebSocket(parsed);
    const generation = ++this.generation;
    const socket = this.createSocket(websocket.url, websocket.protocols);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.serviceSession = {
      appPublicKey: new Uint8Array(),
      appSequence: 0,
      parsed,
      walletSequence: 1,
    };

    this.publish({
      accounts: [],
      phase: 'connecting',
      session: {
        appName: 'Iroha dApp',
        chainId: parsed.chainId,
        network: parsed.network,
        protocol: 'iroha-connect-v1-uranai',
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
    socket.onmessage = (event) => void this.onSocketMessage(event.data, generation);
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

    const walletKeyPair = this.makeWalletKeyPair();
    try {
      if (walletKeyPair.privateKey.length !== 32 || walletKeyPair.publicKey.length !== 32) {
        throw new Error('Unable to create the IrohaConnect session key.');
      }
      const preimage = buildLegacyIrohaConnectApprovalPreimage({
        sid: session.parsed.sid,
        appPublicKey: session.appPublicKey,
        walletPublicKey: walletKeyPair.publicKey,
        accountId,
      });
      const signed = this.signForAccount(accountId, session.parsed.network, preimage);
      const frame = encodeLegacyIrohaConnectApproveFrame({
        sid: session.parsed.sid,
        network: session.parsed.network,
        sequence: session.walletSequence,
        walletPublicKey: walletKeyPair.publicKey,
        accountId,
        walletSignature: signed.signature,
      });

      this.send(frame);
      session.walletSequence += 1;
      this.selectedAccount = account;
      this.publish({
        ...this.snapshot,
        error: undefined,
        phase: 'connected',
        selectedAccountId: account.address,
        session: this.snapshot.session ? { ...this.snapshot.session, connectedAt: this.now() } : undefined,
      });
      this.scheduleKeepAlive();
    } finally {
      walletKeyPair.privateKey.fill(0);
    }

    return this.snapshot;
  }

  rejectSession(): IrohaConnectSnapshot {
    const session = this.requireSession('session-approval');
    this.send(
      encodeLegacyIrohaConnectRejectFrame({
        sid: session.parsed.sid,
        sequence: session.walletSequence,
        code: 4_001,
        codeId: 'user_rejected',
        reason: 'The wallet user rejected the connection.',
      })
    );
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

    const signed = this.signForAccount(pending.accountId, session.parsed.network, pending.signingMessage);
    this.sendJson({
      schema: CONTRACT_SIGNATURE_SCHEMA,
      kind: 'contract_call_signature_response',
      requestId: pending.requestId,
      publicKeyHex: signed.publicKeyHex,
      signatureB64: base64Encode(signed.signature),
    });
    this.clearPendingRequest();
    this.publishConnected();

    return this.snapshot;
  }

  rejectRequest(requestId: string): IrohaConnectSnapshot {
    const pending = this.requirePendingRequest(requestId);
    this.sendContractRejection(pending.requestId, 'user_rejected', 'The wallet user rejected the signature request.');
    this.clearPendingRequest();
    this.publishConnected();

    return this.snapshot;
  }

  disconnect(): IrohaConnectSnapshot {
    const session = this.serviceSession;
    if (session && this.socket?.readyState === 1) {
      try {
        this.send(
          encodeLegacyIrohaConnectCloseFrame({
            sid: session.parsed.sid,
            sequence: session.walletSequence,
            code: 1_000,
            reason: 'The wallet disconnected.',
          })
        );
      } catch {
        // Closing the local socket remains safe if the peer cannot receive the final frame.
      }
    }
    this.closeSocket(true);

    return this.snapshot;
  }

  clearError(): IrohaConnectSnapshot {
    if (this.snapshot.phase === 'error') this.publish({ ...EMPTY_IROHA_CONNECT_SNAPSHOT });
    else if (this.snapshot.error) this.publish({ ...this.snapshot, error: undefined });

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
      const frame = decodeLegacyIrohaConnectFrame(bytes, {
        expectedSid: session.parsed.sid,
        expectedNetwork: session.parsed.network,
        expectedDirection: 'app-to-wallet',
      });

      if (frame.kind !== 'open' && (session.appSequence === 0 || this.snapshot.phase === 'connecting')) {
        throw new Error('The dApp sent data before opening the session.');
      }
      if (frame.sequence <= session.appSequence) throw new Error('The dApp replayed an IrohaConnect frame.');
      if (frame.sequence !== session.appSequence + 1) {
        throw new Error('The dApp sent an out-of-order IrohaConnect frame.');
      }

      if (frame.kind === 'open') {
        this.handleOpen(frame, session);
        return;
      }

      session.appSequence = frame.sequence;
      if (frame.kind === 'ping') {
        this.send(
          encodeLegacyIrohaConnectPongFrame({
            sid: session.parsed.sid,
            sequence: session.walletSequence,
            nonce: frame.nonce,
          })
        );
        session.walletSequence += 1;
        return;
      }
      if (frame.kind === 'pong') return;
      if (frame.kind !== 'ciphertext') throw new Error('The dApp sent an unsupported IrohaConnect frame.');
      this.handleAppPayload(frame.aead);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The dApp sent an invalid IrohaConnect frame.');
    }
  }

  private handleOpen(frame: DecodedLegacyIrohaConnectOpenFrame, session: ServiceSession): void {
    if (this.snapshot.phase !== 'connecting' || session.appSequence !== 0 || frame.sequence !== 1) {
      throw new Error('The dApp sent an unexpected Open frame.');
    }

    session.appSequence = frame.sequence;
    session.appPublicKey = frame.appPublicKey;
    if (this.connectTimer) {
      this.clearTimer(this.connectTimer);
      this.connectTimer = undefined;
    }

    const accounts = this.getAccounts(session.parsed.network);
    this.publish({
      accounts,
      phase: 'session-approval',
      session: {
        appName: frame.appMeta?.name || 'Iroha dApp',
        appUrl: normalizeAppUrl(frame.appMeta?.url),
        chainId: frame.chainId,
        network: frame.network,
        protocol: 'iroha-connect-v1-uranai',
        toriiBaseUrl: session.parsed.node,
      },
    });
    this.scheduleKeepAlive();
  }

  private handleAppPayload(bytes: Uint8Array): void {
    if (!this.selectedAccount || (this.snapshot.phase !== 'connected' && this.snapshot.phase !== 'request-approval')) {
      throw new Error('The dApp sent a request before wallet approval.');
    }

    let value: unknown;
    try {
      value = JSON.parse(strictTextDecoder.decode(bytes));
    } catch {
      throw new Error('The dApp request is not valid UTF-8 JSON.');
    }
    if (!isRecord(value)) throw new Error('The dApp request must be a JSON object.');

    if (value.schema === PRIVATE_TRADE_PROOF_SCHEMA && value.kind === 'private_trade_proof_request') {
      const requestId =
        typeof value.requestId === 'string' && REQUEST_ID_PATTERN.test(value.requestId) ? value.requestId : '';
      if (!requestId) throw new Error('The private proof request ID is invalid.');
      this.sendJson({
        schema: PRIVATE_TRADE_PROOF_SCHEMA,
        kind: 'private_trade_proof_reject',
        requestId,
        code: 'unsupported_private_proof',
        reason: 'Fearless does not create private trade proofs in this release.',
      });
      return;
    }

    let request: ContractSignaturePayload;
    try {
      request = parseContractSignaturePayload(value);
    } catch (error) {
      const requestId =
        typeof value.requestId === 'string' && REQUEST_ID_PATTERN.test(value.requestId) ? value.requestId : '';
      if (requestId && value.schema === CONTRACT_SIGNATURE_SCHEMA) {
        this.sendContractRejection(
          requestId,
          'invalid_request',
          error instanceof Error ? error.message : 'The signature request is invalid.'
        );
        return;
      }
      throw error;
    }

    if (request.accountId !== this.selectedAccount.address) {
      this.sendContractRejection(request.requestId, 'account_mismatch', 'The request targets a different account.');
      return;
    }
    if (this.pendingSignature) {
      this.sendContractRejection(
        request.requestId,
        'request_in_progress',
        'Another signature request is being reviewed.'
      );
      return;
    }

    const createdAt = this.now();
    const expiresAt = createdAt + SIGNING_REQUEST_TTL_MS;
    const timer = this.setTimer(() => this.expirePendingRequest(request.requestId), SIGNING_REQUEST_TTL_MS);
    this.pendingSignature = { ...request, expiresAt, timer };
    const publicRequest: IrohaConnectSigningRequest = {
      accountId: request.accountId,
      contractAddress: request.contractAddress,
      contractAlias: request.contractAlias,
      createdAt,
      entrypoint: request.entrypoint,
      expiresAt,
      requestId: request.requestId,
      signingMessageBytes: request.signingMessage.length,
      signingMessageSha256: bytesToHex(sha256(request.signingMessage)),
    };
    this.publish({ ...this.snapshot, error: undefined, phase: 'request-approval', request: publicRequest });
  }

  private getAccounts(network: LegacyIrohaConnectNetwork): IrohaConnectAccount[] {
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
    network: LegacyIrohaConnectNetwork,
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
    if (!meta.walletEcosystem) throw new Error('The selected account cannot export Iroha signing material.');
    const { seed } = this.state.keyringService.exportMnemonic({
      address: keyringAccount.address,
      walletEcosystem: meta.walletEcosystem,
    });
    if (!seed) throw new Error('The selected account cannot be unlocked for signing.');

    const derived = deriveIrohaSigningKey({ mnemonic: seed });
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
    if (expectedPhase && this.snapshot.phase !== expectedPhase)
      throw new Error('That IrohaConnect action is not available.');

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

  private sendJson(value: Record<string, unknown>): void {
    const session = this.requireSession();
    const payload = textEncoder.encode(JSON.stringify(value));
    this.send(
      encodeLegacyIrohaConnectCiphertextFrame({
        sid: session.parsed.sid,
        sequence: session.walletSequence,
        aead: payload,
      })
    );
    session.walletSequence += 1;
  }

  private sendContractRejection(requestId: string, code: string, reason: string): void {
    this.sendJson({
      schema: CONTRACT_SIGNATURE_SCHEMA,
      kind: 'contract_call_signature_reject',
      requestId,
      code,
      reason,
    });
  }

  private expirePendingRequest(requestId: string): void {
    if (!this.pendingSignature || this.pendingSignature.requestId !== requestId) return;
    try {
      this.sendContractRejection(requestId, 'request_expired', 'The wallet approval timed out.');
    } catch {
      // The socket close path below clears the same request.
    }
    this.clearPendingRequest();
    if (this.socket?.readyState === 1) this.publishConnected();
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
        // Torii ignores text frames. This produces WebSocket traffic for Chrome's
        // extension-worker lifetime without forwarding a protocol frame, consuming
        // a sequence number, or creating a Ping/Pong obligation for legacy apps.
        this.socket.send(KEEP_ALIVE_MESSAGE);
        this.scheduleKeepAlive();
      } catch {
        this.fail('The IrohaConnect background keepalive failed.');
      }
    }, KEEP_ALIVE_INTERVAL_MS);
  }

  private clearPendingRequest(): void {
    if (!this.pendingSignature) return;
    this.clearTimer(this.pendingSignature.timer);
    this.pendingSignature.signingMessage.fill(0);
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
