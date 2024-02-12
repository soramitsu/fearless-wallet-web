import { type BehaviorSubject } from 'rxjs';
import EvmRequestHandler from '@extension-base/services/request-service/handlers/EvmRequestHandler';
import {
  ConnectWCRequestHandler,
  NotSupportWCRequestHandler,
  PopupHandler,
  AuthRequestHandler,
  MetadataRequestHandler,
  SubstrateRequestHandler,
} from '@extension-base/services/request-service/handlers';
import { type KeyringService } from '@extension-base/services';
import { assert } from '@polkadot/util';
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
import type { WCSignRequest } from '@extension-base/services/request-service/types';

export class RequestService {
  readonly keyringService: KeyringService;
  readonly popupHandler: PopupHandler;
  readonly connectWCRequestHandler: ConnectWCRequestHandler;
  readonly notSupportWCRequestHandler: NotSupportWCRequestHandler;
  readonly metadataRequestHandler: MetadataRequestHandler;
  readonly authRequestHandler: AuthRequestHandler;
  readonly substrateRequestHandler: SubstrateRequestHandler;
  readonly evmRequestHandler: EvmRequestHandler;

  constructor(keyringService: KeyringService) {
    this.keyringService = keyringService;
    this.popupHandler = new PopupHandler(this);
    this.connectWCRequestHandler = new ConnectWCRequestHandler(this);
    this.notSupportWCRequestHandler = new NotSupportWCRequestHandler(this);
    this.metadataRequestHandler = new MetadataRequestHandler(this);
    this.authRequestHandler = new AuthRequestHandler(this);
    this.substrateRequestHandler = new SubstrateRequestHandler(this, this.keyringService);
    this.evmRequestHandler = new EvmRequestHandler(this);
  }

  public updateIcon(shouldClose?: boolean): void {
    this.popupHandler.updateIcon(shouldClose);
  }

  // Popup
  public get popup() {
    return this.popupHandler.popup;
  }

  public popupClose(): void {
    this.popupHandler.popupClose();
  }

  public popupOpen(): void {
    // Not open new popup and use existed
    const popupList = this.popupHandler.popup;

    if (popupList && popupList.length > 0) {
      chrome.windows.update(popupList[0], { focused: true })?.catch(console.error);
    } else this.popupHandler.popupOpen();
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

  public setAuthorize(data: AuthUrls, callback?: () => void): void {
    this.authRequestHandler.setAuthorize(data, callback);
  }

  public getAuthorize(update: (value: AuthUrls) => void): void {
    this.authRequestHandler.getAuthorize(update);
  }

  public getAuthList(): Promise<AuthUrls> {
    return this.authRequestHandler.getAuthList();
  }

  public authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<boolean> {
    return this.authRequestHandler.authorizeUrl(url, request);
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

  // Substrate requests
  public get signSubject(): BehaviorSubject<SigningRequest[]> {
    return this.substrateRequestHandler.signSubject;
  }

  public get allSubstrateRequests(): SigningRequest[] {
    return this.substrateRequestHandler.allSubstrateRequests;
  }

  public sign(url: string, request: RequestSign, account: AccountJson, id?: string): Promise<ResponseSigning> {
    return this.substrateRequestHandler.sign(url, request, account, id);
  }

  public get numSubstrateRequests(): number {
    return this.substrateRequestHandler.numSubstrateRequests;
  }

  public getSignRequest(id: string) {
    return this.substrateRequestHandler.getSignRequest(id);
  }

  //Evm
  public get signWcSubject(): BehaviorSubject<WalletConnectTransactionRequest[]> {
    return this.evmRequestHandler.signSubject;
  }

  public signWcRequest(topic: string): WCSignRequest {
    return this.evmRequestHandler.getSignWCRequest(topic);
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

  public addConnectWCRequest(request: WalletConnectSessionRequest): void {
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
    return this.notSupportWCRequestHandler.addNotSupportWCRequest(request);
  }

  // General methods
  public get numRequests(): number {
    return (
      this.numMetaRequests +
      this.numAuthRequests +
      this.numSubstrateRequests +
      this.numConnectWCRequests +
      this.numNotSupportWCRequests +
      this.numSignWCRequests
    );
  }

  async removeAuthorization(url: string): Promise<AuthUrls> {
    const entries = await this.getAuthList();
    const entry = entries[url];

    assert(entry, `The source ${url} is not known`);

    delete entries[url];

    this.setAuthorize(entries);

    return entries;
  }

  async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    const entries = await this.getAuthList();

    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      entries[url].authorizedAccounts = authorizedAccountDiff;
    });

    return this.setAuthorize(entries);
  }

  async authorizeCancel({ id }: RequestAuthorizeCancel): Promise<boolean> {
    const queued = await this.getAuthRequest(id);

    assert(queued, 'Unable to find request');

    const { reject } = queued;

    // Reject without error meaning cancel
    reject(new Error('Cancelled'));

    return true;
  }
}
