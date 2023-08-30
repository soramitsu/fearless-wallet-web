import { BehaviorSubject } from 'rxjs';
import { MetadataDef } from '@polkadot/extension-inject/types';
import { WalletConnectNotSupportRequest, WalletConnectSessionRequest } from '../wallet-connect-service/types';
import State from '../../background/handlers/State';
import {
  AuthorizeRequest,
  AuthRequest,
  AuthUrls,
  MetadataRequest,
  MetaRequest,
  RequestAuthorizeTab,
  RequestSign,
  ResponseSigning,
  SigningRequest,
} from '../../background/types';
import { NetworkService } from '..';
import { AccountJson } from '../../background/types/types';
import {
  ConnectWCRequestHandler,
  NotSupportWCRequestHandler,
  PopupHandler,
  AuthRequestHandler,
  MetadataRequestHandler,
  SubstrateRequestHandler,
} from './handlers';

export class RequestService {
  readonly state: State;
  readonly popupHandler: PopupHandler;
  readonly networkService: NetworkService;
  readonly connectWCRequestHandler: ConnectWCRequestHandler;
  readonly notSupportWCRequestHandler: NotSupportWCRequestHandler;
  readonly metadataRequestHandler: MetadataRequestHandler;
  readonly authRequestHandler: AuthRequestHandler;
  readonly substrateRequestHandler: SubstrateRequestHandler;

  constructor(state: State, networkService: NetworkService) {
    this.state = state;
    this.networkService = networkService;
    this.popupHandler = new PopupHandler(this);
    this.connectWCRequestHandler = new ConnectWCRequestHandler(this);
    this.notSupportWCRequestHandler = new NotSupportWCRequestHandler(this);
    this.metadataRequestHandler = new MetadataRequestHandler(this);
    this.authRequestHandler = new AuthRequestHandler(this.state, this, this.networkService);
    this.substrateRequestHandler = new SubstrateRequestHandler(this);
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
    } else {
      this.popupHandler.popupOpen();
    }
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
      this.numNotSupportWCRequests
    );
  }
}
