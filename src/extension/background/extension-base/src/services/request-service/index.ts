import { type BehaviorSubject } from 'rxjs';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import { chrome } from '@extension-base/utils/crossenv';
import {
  ConnectWCRequestHandler,
  NotSupportWCRequestHandler,
  PopupHandler,
  AuthRequestHandler,
  MetadataRequestHandler,
  SubstrateRequestHandler,
  SolanaRequestHandler,
} from '@extension-base/services/request-service/handlers';
import { type KeyringService } from '@extension-base/services';
import { assert } from '@polkadot/util';
import { type NetworkJson } from '@extension-base/types';
import type {
  WalletConnectNotSupportRequest,
  WalletConnectSessionRequest,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import type {
  SigningRequest,
  AuthRequest,
  AuthUrls,
  MetaRequest,
  RequestAuthorizeTab,
  RequestSign,
  ResponseSigning,
  AccountJson,
  AuthorizeRequest,
  MetadataRequest,
  AuthorizedAccountsDiff,
  RequestAuthorizeCancel,
} from '@extension-base/background/types/types';
import type { DAppChainInfoPayload, EvmRequests, WCSignRequest } from '@extension-base/services/request-service/types';
import type { SigningRequestKind } from '@extension-base/services/request-service/signingRequestId';
import type State from '@extension-base/background/handlers/State';

export class RequestService {
  readonly popupHandler: PopupHandler;
  readonly connectWCRequestHandler: ConnectWCRequestHandler;
  readonly notSupportWCRequestHandler: NotSupportWCRequestHandler;
  readonly metadataRequestHandler: MetadataRequestHandler;
  readonly authRequestHandler: AuthRequestHandler;
  readonly substrateRequestHandler: SubstrateRequestHandler;
  readonly evmRequestHandler: EvmRequestHandler;
  readonly solanaRequestHandler: SolanaRequestHandler;

  constructor(
    readonly keyringService: KeyringService,
    private readonly state: State
  ) {
    this.popupHandler = new PopupHandler(state);
    this.connectWCRequestHandler = new ConnectWCRequestHandler(this);
    this.notSupportWCRequestHandler = new NotSupportWCRequestHandler(this);
    this.metadataRequestHandler = new MetadataRequestHandler(this);
    this.authRequestHandler = new AuthRequestHandler(this, state);
    this.substrateRequestHandler = new SubstrateRequestHandler(this, this.state);
    this.evmRequestHandler = new EvmRequestHandler(this);
    this.solanaRequestHandler = new SolanaRequestHandler(this);
  }

  public updateIcon(shouldClose?: boolean): void {
    this.popupHandler.updateIcon(shouldClose);
  }

  public async resetWallet(): Promise<void> {
    // Revocation vetoes existing grants synchronously, then acknowledges its
    // durable write. Pending signing promises are settled before keys disappear.
    const revoked = this.authRequestHandler.resetWallet();
    this.substrateRequestHandler.resetWallet();
    this.evmRequestHandler.resetWallet();
    this.solanaRequestHandler.resetWallet();
    this.metadataRequestHandler.resetWallet();
    this.connectWCRequestHandler.resetWallet();
    this.notSupportWCRequestHandler.resetWallet();
    await revoked;
  }

  public cancelSigningRequests(): void {
    // Keep saved site grants and sessions, but require a fresh signing request
    // after locking; an approval already in flight must fail its identity guard.
    const error = new Error('Wallet locked. Request approval again after unlocking.');
    this.substrateRequestHandler.cancelPending(error);
    this.evmRequestHandler.cancelPending(error);
    this.solanaRequestHandler.cancelPending(error);
  }

  // Popup
  public popupOpen(path?: string): void {
    // Not open new popup and use existed
    const popupList = this.popupHandler.popup;

    if (popupList?.length > 0) {
      const windowId = popupList[0];

      void this.popupHandler
        .popupNavigate(windowId, path)
        .then(() => chrome.windows.update(windowId, { focused: true }))
        .catch(() => {
          this.popupHandler.forgetPopup(windowId);
          this.popupOpen(path);
        });
    } else this.popupHandler.popupOpen(path);
  }

  // Metadata
  public get metaSubject(): BehaviorSubject<MetadataRequest[]> {
    return this.metadataRequestHandler.metaSubject;
  }

  public get knownMetadata(): MetadataDef[] {
    return this.metadataRequestHandler.knownMetadata;
  }

  public get numMetaRequests(): number {
    return this.metadataRequestHandler.numMetaRequests;
  }

  public injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    if (this.keyringService.isResetting) return Promise.reject(new Error('Wallet reset is in progress'));
    return this.metadataRequestHandler.injectMetadata(url, request);
  }

  public getMetaRequest(id: string): MetaRequest {
    return this.metadataRequestHandler.getMetaRequest(id);
  }

  public saveMetadata(meta: MetadataDef): void {
    this.metadataRequestHandler.saveMetadata(meta);
  }

  // Auth
  public get authSubject(): BehaviorSubject<AuthorizeRequest[]> {
    return this.authRequestHandler.authSubject;
  }

  public get numAuthRequests(): number {
    return this.authRequestHandler.numAuthRequests;
  }

  public setAuthorize(data: AuthUrls, callback?: () => void): Promise<void> {
    return this.authRequestHandler.setAuthorize(data, callback);
  }

  public getAuthorize(update: (value: AuthUrls) => void): Promise<void> {
    return this.authRequestHandler.getAuthorize(update);
  }

  public getAuthList(): Promise<AuthUrls> {
    return this.authRequestHandler.getAuthList();
  }

  public mutateAuthorizations(update: (entries: AuthUrls) => void): Promise<AuthUrls> {
    return this.authRequestHandler.mutateAuthorizations(update);
  }

  public authorizeUrl(url: string, request: RequestAuthorizeTab, signal?: AbortSignal): Promise<boolean> {
    return this.authRequestHandler.authorizeUrl(url, request, signal);
  }

  public getAuthRequest(id: string): AuthRequest {
    return this.authRequestHandler.getAuthRequest(id);
  }

  public get subscribeEvmChainChange() {
    return this.authRequestHandler.subscribeEvmChainChange;
  }

  public get subscribeAuthorizeUrlSubject() {
    return this.authRequestHandler.subscribeAuthorizeUrlSubject;
  }

  public ensureUrlAuthorized(url: string): Promise<boolean> {
    return this.authRequestHandler.ensureUrlAuthorized(url);
  }

  public ensureAccountAuthorized(url: string, address: string): Promise<boolean> {
    return this.authRequestHandler.ensureAccountAuthorized(url, address);
  }

  // Substrate requests
  public get signSubject(): BehaviorSubject<SigningRequest[]> {
    return this.substrateRequestHandler.signSubject;
  }

  public sign(url: string, request: RequestSign, account: AccountJson, id?: string): Promise<ResponseSigning> {
    return this.substrateRequestHandler.sign(url, request, account, id);
  }

  public signWalletConnect(
    context: import('@extension-base/services/wallet-connect-service/polkadotSigningContext').PolkadotSigningContext
  ) {
    return this.substrateRequestHandler.signWalletConnect(context);
  }

  public get numSubstrateRequests(): number {
    return this.substrateRequestHandler.numSubstrateRequests;
  }

  /**
   * The queued signing request with this key, in the queue the popup names when it shows a request. Without a queue
   * the key must be in exactly one: an approval may never reach a request the popup did not show.
   */
  public getSignRequest(id: string, kind?: SigningRequestKind) {
    if (kind === 'evm') return this.evmRequestHandler?.getEvmSignRequest(id);
    if (kind === 'solana') return this.solanaRequestHandler?.getSolanaSignRequest(id);
    if (kind === 'substrate') return this.substrateRequestHandler?.getSignRequest(id);

    const found = [
      this.evmRequestHandler?.getEvmSignRequest(id),
      this.solanaRequestHandler?.getSolanaSignRequest(id),
      this.substrateRequestHandler?.getSignRequest(id),
    ].filter((request) => request !== undefined);

    if (found.length > 1) throw new Error('Signing request ID is ambiguous');

    return found[0];
  }

  /** Whether any signing queue holds this key. A new request never takes a key another queue already uses. */
  public hasSigningRequest(id: string): boolean {
    return (
      this.evmRequestHandler?.getEvmSignRequest(id) !== undefined ||
      this.solanaRequestHandler?.getSolanaSignRequest(id) !== undefined ||
      this.substrateRequestHandler?.getSignRequest(id) !== undefined
    );
  }

  //Evm
  public get signWcSubject(): BehaviorSubject<WalletConnectTransactionRequest[]> {
    return this.evmRequestHandler.signWcSubject;
  }

  public get signEvmSubject(): BehaviorSubject<EvmRequests> {
    return this.evmRequestHandler.signEvmSubject;
  }

  public get signSolanaSubject() {
    return this.solanaRequestHandler.signSolanaSubject;
  }

  public signWcRequest(approvalId: string): WCSignRequest | undefined {
    return this.evmRequestHandler.getSignWCRequest(approvalId);
  }

  public getEvmNetworkInfo(options: DAppChainInfoPayload): NetworkJson | undefined {
    return this.authRequestHandler.getEvmNetworkInfo(options);
  }

  // WalletConnect Connect requests
  public getConnectWCRequest(id: string) {
    return this.connectWCRequestHandler.getConnectWCRequest(id);
  }

  public get connectWCSubject(): BehaviorSubject<WalletConnectSessionRequest[]> {
    return this.connectWCRequestHandler.connectWCSubject;
  }

  public get allConnectWCRequests(): WalletConnectSessionRequest[] {
    return this.connectWCRequestHandler.allConnectWCRequests;
  }

  public get numConnectWCRequests(): number {
    return this.connectWCRequestHandler.numConnectWCRequests;
  }

  public get numSignWCRequests(): number {
    return this.evmRequestHandler.numWcSignRequest;
  }

  public get numEvmSignRequests(): number {
    return this.evmRequestHandler.numEvmSignRequest;
  }

  public get numSolanaSignRequests(): number {
    return this.solanaRequestHandler.numSolanaSignRequest;
  }

  public addConnectWCRequest(request: WalletConnectSessionRequest): void {
    if (this.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    return this.connectWCRequestHandler.addConnectWCRequest(request);
  }

  // WalletConnect not support requests
  public getNotSupportWCRequest(id: string) {
    return this.notSupportWCRequestHandler.getNotSupportWCRequest(id);
  }

  public get notSupportWCSubject(): BehaviorSubject<WalletConnectNotSupportRequest[]> {
    return this.notSupportWCRequestHandler.notSupportWCSubject;
  }

  public get allNotSupportWCRequests(): WalletConnectNotSupportRequest[] {
    return this.notSupportWCRequestHandler.allNotSupportWCRequests;
  }

  public get numNotSupportWCRequests(): number {
    return this.notSupportWCRequestHandler.numNotSupportWCRequests;
  }

  public addNotSupportWCRequest(request: WalletConnectNotSupportRequest): void {
    if (this.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    return this.notSupportWCRequestHandler.addNotSupportWCRequest(request);
  }

  // General methods
  public get numIrohaConnectRequests(): number {
    const irohaConnectPhase = this.state.irohaConnectService?.snapshot.phase;

    return irohaConnectPhase === 'session-approval' || irohaConnectPhase === 'request-approval' ? 1 : 0;
  }

  public get numStandardRequests(): number {
    return (
      this.numMetaRequests +
      this.numAuthRequests +
      this.numSubstrateRequests +
      this.numConnectWCRequests +
      this.numNotSupportWCRequests +
      this.numSignWCRequests +
      this.numEvmSignRequests +
      this.numSolanaSignRequests
    );
  }

  public get numRequests(): number {
    return this.numStandardRequests + this.numIrohaConnectRequests;
  }

  async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    await this.mutateAuthorizations((entries) => {
      authorizedAccountDiff.forEach(([url, authorizedAccounts, authType]) => {
        const entry = entries[url];
        if (!entry) return;
        if (authType === 'substrate') entry.authorizedAccounts = authorizedAccounts;
        else if (authType === 'evm') entry.evmAuthorizedAccount = authorizedAccounts[0] ?? '';
        else if (authType === 'solana') entry.solanaAuthorizedAccount = authorizedAccounts[0] ?? '';
        else if (authType === 'iroha') entry.irohaAuthorizedAccount = authorizedAccounts[0] ?? '';
      });
    });
  }

  authorizeCancel({ id }: RequestAuthorizeCancel): boolean {
    const queued = this.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    // Reject without error meaning cancel
    reject(new Error('Cancelled'));

    return true;
  }
}
