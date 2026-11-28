import { BehaviorSubject } from 'rxjs';
import { Address } from '@ton/core';
import { checkIfDenied } from '@polkadot/phishing';
import { tonStore } from '@extension-base/stores/TonStore';
import { isDappSigningAllowed } from '@extension-base/services/dapp-signing-kill-switch-service';
import { siteApprovalsInProgress, siteTransactionsBeingSent } from '@extension-base/services/request-service/siteApprovals';
import TonConnectStore, { type TonConnectSession } from './store';
import { fetchTonConnectManifest, type TonConnectManifest } from './manifest';
import {
  sendTonConnectTransaction,
  signTonData,
  signTonProof,
  tonAddressReply,
  tonConnectAccounts,
  type TonConnectAccount,
} from './signer';
import type State from '@extension-base/background/handlers/State';
import type {
  TonRequestsSubjectPayload,
  TonSigningResponse,
  TonSignDataPreview,
} from '@extension-base/services/request-service/types';
import { APP_VERSION, IS_EXTENSION } from '@/consts/global';
import { DappSigningPausedError } from '@/util/dappSigningKillSwitch';
import { assertWalletAllowsNormalUse } from '@/util/walletRecoveryPolicy';
import { isStoredWalletRecoveryOnly } from '@/util/walletRecoveryActions';
import {
  CONNECT_ERROR,
  RPC_ERROR,
  TON_CONNECT_PROTOCOL_VERSION,
  TonConnectError,
  isTonConnectPageOrigin,
  parseAppRequest,
  parseConnectRequest,
  parseSendTransactionParams,
  parseSignDataParams,
  previewTonMessage,
  rawTonAddress,
  requestIdFollows,
  tonConnectDeviceInfo,
  tonConnectPlatform,
  tonConnectSigningDomain,
  type ParsedConnectRequest,
  type ParsedSignData,
  type TonConnectTransaction,
} from '@/util/tonConnect/protocol';

export type TonConnectEvent =
  | {
      event: 'connect';
      id: number;
      payload: { items: unknown[]; device: ReturnType<typeof tonConnectDeviceInfo> };
    }
  | { event: 'connect_error'; id: number; payload: { code: number; message: string } }
  | { event: 'disconnect'; id: number; payload: Record<string, never> };

export type TonConnectWalletResponse =
  | { id: string; result: unknown }
  | { id: string; error: { code: number; message: string } };

/** A connect prompt waiting in the popup. */
export type TonConnectApprovalRequest = {
  id: string;
  /** The page that asked; the review shows it before the manifest's name. */
  origin: string;
  manifest: TonConnectManifest;
  /** The manifest's app URL is on the page's own host. */
  manifestMatchesOrigin: boolean;
  /** The page asks for a `ton_proof` signature bound to this domain. */
  proofDomain?: string;
  accounts: TonConnectAccount[];
  defaultAddress?: string;
};

/** A connected page, as Settings lists it. */
export type TonConnectSessionView = {
  origin: string;
  address: string;
  accountName: string;
  manifest: TonConnectManifest;
  connectedAt: number;
};

type PendingConnect = TonConnectApprovalRequest & {
  request: ParsedConnectRequest;
  resolve: (event: TonConnectEvent) => void;
  approving: boolean;
};

const MAX_PENDING_CONNECTS = 8;

const nowSeconds = () => Math.floor(Date.now() / 1000);

const userAgent = (): string => (typeof navigator === 'undefined' ? '' : navigator.userAgent ?? '');

/**
 * TON Connect over the JS bridge (`window.Fearless.tonconnect`): sessions bound to a page origin and one TON wallet,
 * the connect prompt and the RPC methods. Transactions and signData go to the popup's TON signing queue.
 */
export class TonConnectService {
  readonly connectRequestsSubject = new BehaviorSubject<TonConnectApprovalRequest[]>([]);
  readonly sessionsSubject = new BehaviorSubject<TonConnectSessionView[]>([]);

  private readonly pending = new Map<string, PendingConnect>();
  private readonly listeners = new Map<string, Set<(event: TonConnectEvent) => void>>();
  private lastEventId = 0;

  constructor(
    private readonly state: State,
    private readonly fetchManifest: (url: string) => Promise<TonConnectManifest> = (url) => fetchTonConnectManifest(url),
    private readonly now: () => number = nowSeconds,
    private readonly store: Pick<TonConnectStore, 'readSessions' | 'mutateSessions'> = new TonConnectStore()
  ) {}

  get numConnectRequests(): number {
    return this.pending.size;
  }

  private nextEventId(): number {
    this.lastEventId = Math.max(Date.now(), this.lastEventId + 1);

    return this.lastEventId;
  }

  private device() {
    return tonConnectDeviceInfo(APP_VERSION, tonConnectPlatform(userAgent()));
  }

  private connectError(code: number, message: string): TonConnectEvent {
    return { event: 'connect_error', id: this.nextEventId(), payload: { code, message } };
  }

  private async readyAccounts(): Promise<TonConnectAccount[]> {
    // The TON keyring reads its records at start-up; until then it would look as if every wallet were gone.
    await tonStore.loaded.catch(() => undefined);

    const stored = [...this.state.keyringService.getAllAccounts(), ...this.state.keyringService.tonKeyring.getAccounts()];

    return tonConnectAccounts(this.state).filter(({ address }) => !IS_EXTENSION || !isStoredWalletRecoveryOnly(stored, address));
  }

  private assertNormalWalletUse(address: string): void {
    if (!IS_EXTENSION) return;
    assertWalletAllowsNormalUse(
      [...this.state.keyringService.getAllAccounts(), ...this.state.keyringService.tonKeyring.getAccounts()],
      address
    );
  }

  /** The page's session, if its wallet still exists. A session whose wallet was removed ends here. */
  private async session(origin: string): Promise<TonConnectSession | undefined> {
    const session = (await this.store.readSessions()).sessions[origin];

    if (!session) return undefined;
    if ((await this.readyAccounts()).some(({ address }) => address === session.address)) return session;

    await this.removeSessions((candidate) => candidate.origin === origin, false);

    return undefined;
  }

  // -------------------------------------------------------------------------------------------------------------
  // Page requests

  async connect(origin: string, protocolVersion: unknown, request: unknown, signal?: AbortSignal): Promise<TonConnectEvent> {
    if (!isTonConnectPageOrigin(origin))
      return this.connectError(CONNECT_ERROR.BAD_REQUEST, 'TON Connect needs a secure (HTTPS) page');
    if (typeof protocolVersion !== 'number' || !Number.isInteger(protocolVersion) || protocolVersion < TON_CONNECT_PROTOCOL_VERSION)
      return this.connectError(CONNECT_ERROR.BAD_REQUEST, 'Unsupported protocol version');

    let parsed: ParsedConnectRequest;
    let proofDomain: string | undefined;
    let manifest: TonConnectManifest;

    try {
      parsed = parseConnectRequest(request);
      if (parsed.proof) proofDomain = tonConnectSigningDomain(origin);
      manifest = await this.fetchManifest(parsed.manifestUrl);
    } catch (error) {
      if (error instanceof TonConnectError) return this.connectError(error.code, error.message);

      return this.connectError(CONNECT_ERROR.UNKNOWN, 'The connect request could not be read');
    }

    // A page connected before connects again without a prompt, unless it asks for a new proof, which is a signature.
    const existing = await this.session(origin);

    if (existing && !parsed.proof) {
      await this.saveSession({ ...existing, manifest, lastRequestId: undefined });

      return this.connectEvent(existing.address, parsed, undefined);
    }

    if (this.pending.size >= MAX_PENDING_CONNECTS)
      return this.connectError(CONNECT_ERROR.UNKNOWN, 'Too many connect requests are waiting');
    if (signal?.aborted) return this.connectError(CONNECT_ERROR.USER_DECLINED, 'The page closed');

    const accounts = await this.readyAccounts();
    const current = this.state.currentAccount?.address;
    const defaultAddress =
      existing?.address ?? accounts.find(({ address }) => address === current)?.address ?? accounts[0]?.address;
    let manifestMatchesOrigin = false;

    try {
      manifestMatchesOrigin = new URL(manifest.url).host === new URL(origin).host;
    } catch {
      manifestMatchesOrigin = false;
    }

    return new Promise<TonConnectEvent>((resolve) => {
      const id = `ton-connect.${globalThis.crypto.randomUUID()}`;
      const finish = (event: TonConnectEvent) => {
        if (!this.pending.delete(id)) return;
        signal?.removeEventListener('abort', onAbort);
        this.publishRequests(true);
        resolve(event);
      };
      const onAbort = () => {
        const queued = this.pending.get(id);

        if (queued && !queued.approving) finish(this.connectError(CONNECT_ERROR.USER_DECLINED, 'The page closed'));
      };
      const pending: PendingConnect = {
        id,
        origin,
        manifest,
        manifestMatchesOrigin,
        proofDomain,
        accounts,
        defaultAddress,
        request: parsed,
        approving: false,
        resolve: finish,
      };

      this.pending.set(id, pending);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.publishRequests();
      this.state.requestService.popupOpen();
    });
  }

  async restoreConnection(origin: string): Promise<TonConnectEvent> {
    const session = isTonConnectPageOrigin(origin) ? await this.session(origin) : undefined;

    if (!session) return this.connectError(CONNECT_ERROR.UNKNOWN_APP, 'The app is not connected');

    return this.connectEvent(session.address, undefined, undefined);
  }

  private connectEvent(address: string, request: ParsedConnectRequest | undefined, proof: unknown): TonConnectEvent {
    const items: unknown[] = [tonAddressReply(this.state, address)];

    if (proof) items.push(proof);
    request?.unsupportedItems.forEach((name) =>
      items.push({ name, error: { code: 400, message: 'Fearless Wallet does not support this item' } })
    );

    return { event: 'connect', id: this.nextEventId(), payload: { items, device: this.device() } };
  }

  /** A page's own disconnect: no event goes back to it, as the spec asks. */
  async disconnectPage(origin: string): Promise<boolean> {
    await this.removeSessions((session) => session.origin === origin, false);

    return true;
  }

  async send(origin: string, request: unknown, signal?: AbortSignal): Promise<TonConnectWalletResponse> {
    const rawId = request && typeof request === 'object' ? (request as { id?: unknown }).id : undefined;
    const fallbackId = typeof rawId === 'string' && rawId.length <= 64 ? rawId : '';
    let id = fallbackId;

    try {
      const parsed = parseAppRequest(request);

      id = parsed.id;

      const session = isTonConnectPageOrigin(origin) ? await this.session(origin) : undefined;

      if (!session) throw new TonConnectError(RPC_ERROR.UNKNOWN_APP, 'The app is not connected');
      if (!requestIdFollows(parsed.id, session.lastRequestId))
        throw new TonConnectError(RPC_ERROR.BAD_REQUEST, 'Request ids must increase');
      await this.store.mutateSessions((record) => {
        const saved = record.sessions[origin];

        if (saved && saved.address === session.address) saved.lastRequestId = parsed.id;
      });

      switch (parsed.method) {
        case 'disconnect':
          await this.removeSessions((candidate) => candidate.origin === origin, false);

          return { id, result: {} };
        case 'sendTransaction':
          return { id, result: await this.queueTransaction(session, parsed.params, signal) };
        case 'signData':
          return { id, result: await this.queueSignData(session, parsed.params, signal) };
        default:
          throw new TonConnectError(RPC_ERROR.METHOD_NOT_SUPPORTED, `Fearless Wallet does not support ${parsed.method}`);
      }
    } catch (error) {
      return { id, error: rpcError(error) };
    }
  }

  private accountView(session: TonConnectSession) {
    const account = this.state.keyringService.tonKeyring.accountSubject.value[session.address];

    if (!account) throw new TonConnectError(RPC_ERROR.UNKNOWN_APP, 'The connected wallet is gone');

    return {
      address: session.address,
      name: account.name ?? '',
      publicKey: Buffer.from(account.publicKey).toString('hex'),
    };
  }

  private async queueTransaction(session: TonConnectSession, params: unknown[], signal?: AbortSignal): Promise<string> {
    const transaction = parseSendTransactionParams(params, Address.parse(session.address), this.now());
    const response = await this.state.requestService.tonRequestHandler.queue(
      {
        account: this.accountView(session),
        appName: session.manifest.name,
        method: 'sendTransaction',
        url: session.origin,
        origin: session.origin,
        messages: transaction.messages.map(previewTonMessage),
        validUntil: transaction.validUntil,
      },
      { transaction },
      signal
    );

    if (response.method !== 'sendTransaction') throw new Error('Unexpected TON signing response');

    return response.boc;
  }

  private async queueSignData(session: TonConnectSession, params: unknown[], signal?: AbortSignal) {
    const signDataRequest = parseSignDataParams(params, Address.parse(session.address));
    const domain = tonConnectSigningDomain(session.origin);
    const response = await this.state.requestService.tonRequestHandler.queue(
      {
        account: this.accountView(session),
        appName: session.manifest.name,
        method: 'signData',
        url: session.origin,
        origin: session.origin,
        signData: signDataPreview(signDataRequest),
        domain,
      },
      { signDataRequest },
      signal
    );

    if (response.method !== 'signData') throw new Error('Unexpected TON signing response');

    return {
      signature: response.signature,
      address: rawTonAddress(Address.parse(session.address)),
      timestamp: response.timestamp,
      domain: response.domain,
      payload: signDataRequest.echo,
    };
  }

  // -------------------------------------------------------------------------------------------------------------
  // Events

  /**
   * A page's listener for wallet events. A page that believes it is connected and has no session hears a disconnect
   * at once: the session may have ended while the wallet slept and its port was closed.
   */
  subscribe(origin: string, believesConnected: boolean, emit: (event: TonConnectEvent) => void): () => void {
    let listeners = this.listeners.get(origin);

    if (!listeners) {
      listeners = new Set();
      this.listeners.set(origin, listeners);
    }
    listeners.add(emit);

    if (believesConnected) {
      void this.session(origin)
        .then((session) => {
          if (!session && listeners?.has(emit)) emit({ event: 'disconnect', id: this.nextEventId(), payload: {} });
        })
        .catch(() => undefined);
    }

    return () => {
      listeners?.delete(emit);
      if (listeners?.size === 0) this.listeners.delete(origin);
    };
  }

  private emitDisconnect(origin: string): void {
    const event: TonConnectEvent = { event: 'disconnect', id: this.nextEventId(), payload: {} };

    this.listeners.get(origin)?.forEach((emit) => {
      try {
        emit(event);
      } catch (error) {
        console.error('[TON Connect] A page listener failed', error);
      }
    });
  }

  // -------------------------------------------------------------------------------------------------------------
  // Popup

  getConnectRequest(id: string): TonConnectApprovalRequest | undefined {
    const pending = this.pending.get(id);

    return pending ? publicRequest(pending) : undefined;
  }

  /**
   * The person approved the connect prompt with `address`. A requested proof is signed here, for the page's own
   * domain, after the same checks every dApp signature passes.
   */
  async approveConnect(id: string, address: string): Promise<boolean> {
    const pending = this.pending.get(id);

    if (!pending) throw new Error('Unable to find request');
    if (pending.approving) throw new Error('Connect approval already pending');

    const accounts = await this.readyAccounts();

    if (!accounts.some((account) => account.address === address)) throw new Error('TON wallet not found');
    this.assertNormalWalletUse(address);

    pending.approving = true;

    try {
      if (await checkIfDenied(pending.origin)) {
        pending.resolve(this.connectError(CONNECT_ERROR.USER_DECLINED, 'The site is flagged as phishing'));

        return false;
      }

      let proof: unknown;

      if (pending.request.proof) {
        if (!(await isDappSigningAllowed(this.state, 'ton'))) {
          pending.resolve(this.connectError(CONNECT_ERROR.USER_DECLINED, 'TON dApp signing is paused'));
          throw new DappSigningPausedError('ton');
        }
        proof = await signTonProof(this.state, {
          address,
          domain: pending.proofDomain!,
          timestamp: this.now(),
          payload: pending.request.proof.payload,
        });
      }

      if (this.pending.get(id) !== pending) return false;

      await this.saveSession({
        origin: pending.origin,
        address,
        manifest: pending.manifest,
        connectedAt: Date.now(),
      });
      pending.resolve(this.connectEvent(address, pending.request, proof));

      return true;
    } finally {
      pending.approving = false;
    }
  }

  rejectConnect(id: string): boolean {
    const pending = this.pending.get(id);

    if (!pending || pending.approving) return false;
    pending.resolve(this.connectError(CONNECT_ERROR.USER_DECLINED, 'The user declined the connection'));

    return true;
  }

  /** Approves a queued transaction or signData request: the popup has shown it, the checks have passed. */
  async approveSigning(request: TonRequestsSubjectPayload, assertCurrent: () => void): Promise<TonSigningResponse> {
    const session = await this.session(request.url);

    // The page must still be connected to the wallet the request was queued for.
    if (!session || session.address !== request.account.address) throw new Error('The app is no longer connected');
    this.assertNormalWalletUse(session.address);

    if (request.method === 'sendTransaction') {
      const transaction = request.transaction as TonConnectTransaction;

      if (!transaction) throw new Error('Missing transaction');
      if (transaction.validUntil !== undefined && transaction.validUntil <= this.now()) throw new Error('The request has expired');

      const boc = await sendTonConnectTransaction(this.state, session.address, transaction, () => {
        assertCurrent();
        siteTransactionsBeingSent.add(request);
      });

      return { method: 'sendTransaction', boc };
    }

    const signDataRequest = request.signDataRequest as ParsedSignData;

    if (!signDataRequest || !request.domain) throw new Error('Missing sign data request');

    const timestamp = this.now();
    const signature = await signTonData(this.state, {
      address: session.address,
      domain: request.domain,
      timestamp,
      data: signDataRequest.data,
    });

    assertCurrent();

    return { method: 'signData', signature, timestamp, domain: request.domain };
  }

  isApprovalInProgress(request: TonRequestsSubjectPayload): boolean {
    return siteApprovalsInProgress.has(request);
  }

  async listSessions(): Promise<TonConnectSessionView[]> {
    const record = await this.store.readSessions();
    const accounts = new Map((await this.readyAccounts()).map((account) => [account.address, account]));
    const views = Object.values(record.sessions)
      .filter((session) => accounts.has(session.address))
      .map((session) => ({
        origin: session.origin,
        address: session.address,
        accountName: accounts.get(session.address)?.name ?? '',
        manifest: session.manifest,
        connectedAt: session.connectedAt,
      }))
      .sort((a, b) => b.connectedAt - a.connectedAt);

    this.sessionsSubject.next(views);

    return views;
  }

  /** The person disconnected a page in the wallet: the page hears a disconnect event. */
  async disconnectSession(origin: string): Promise<TonConnectSessionView[]> {
    await this.removeSessions((session) => session.origin === origin, true);

    return this.listSessions();
  }

  /** A TON wallet was removed: every page connected to it is disconnected. */
  async forgetAddress(address: string): Promise<void> {
    await this.removeSessions((session) => session.address === address, true);
    this.connectRequestsSubject.next(this.publicRequests());
  }

  cancelPending(error: Error): void {
    this.pending.forEach((pending) => {
      if (!pending.approving) pending.resolve(this.connectError(CONNECT_ERROR.USER_DECLINED, error.message));
    });
  }

  async resetWallet(): Promise<void> {
    this.cancelPending(new Error('Reset wallet'));
    await this.removeSessions(() => true, true);
  }

  // -------------------------------------------------------------------------------------------------------------

  private async saveSession(session: TonConnectSession): Promise<void> {
    await this.store.mutateSessions((record) => {
      record.sessions[session.origin] = session;
    });
    void this.listSessions().catch(() => undefined);
  }

  private async removeSessions(match: (session: TonConnectSession) => boolean, notify: boolean): Promise<void> {
    const removed: string[] = [];

    await this.store.mutateSessions((record) => {
      Object.values(record.sessions).forEach((session) => {
        if (!match(session)) return;
        delete record.sessions[session.origin];
        removed.push(session.origin);
      });
    });
    if (notify) removed.forEach((origin) => this.emitDisconnect(origin));
    if (removed.length) void this.listSessions().catch(() => undefined);
  }

  private publicRequests(): TonConnectApprovalRequest[] {
    return [...this.pending.values()].map(publicRequest);
  }

  private publishRequests(shouldClose?: boolean): void {
    this.connectRequestsSubject.next(this.publicRequests());
    this.state.requestService.updateIcon(shouldClose);
  }
}

function publicRequest(pending: PendingConnect): TonConnectApprovalRequest {
  return structuredClone({
    id: pending.id,
    origin: pending.origin,
    manifest: pending.manifest,
    manifestMatchesOrigin: pending.manifestMatchesOrigin,
    proofDomain: pending.proofDomain,
    accounts: pending.accounts,
    defaultAddress: pending.defaultAddress,
  });
}

function signDataPreview({ data }: ParsedSignData): TonSignDataPreview {
  if (data.type === 'text') return { type: 'text', text: data.text };
  if (data.type === 'binary')
    return { type: 'binary', byteLength: data.bytes.length, bytesHex: Buffer.from(data.bytes.slice(0, 1024)).toString('hex') };

  return { type: 'cell', schema: data.schema, cellBase64: data.cell.toBoc().toString('base64') };
}

function rpcError(error: unknown): { code: number; message: string } {
  if (error instanceof TonConnectError) return { code: error.code, message: error.message };
  if (error instanceof DappSigningPausedError) return { code: RPC_ERROR.USER_DECLINED, message: 'TON dApp signing is paused' };
  if (error instanceof Error && error.message === 'Cancelled') return { code: RPC_ERROR.USER_DECLINED, message: 'The user declined the request' };
  if (error instanceof Error && error.message.startsWith('Wallet locked'))
    return { code: RPC_ERROR.USER_DECLINED, message: 'The wallet was locked before the request was approved' };

  return { code: RPC_ERROR.UNKNOWN, message: error instanceof Error ? error.message.slice(0, 200) : 'Unknown error' };
}
