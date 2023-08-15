import { BehaviorSubject } from 'rxjs';
import { WalletConnectNotSupportRequest, WalletConnectSessionRequest } from '../wallet-connect-service/types';
import ConnectWCRequestHandler from './handlers/ConnectWCRequestHandler';
import NotSupportWCRequestHandler from './handlers/NotSupportWCRequestHandler';
import PopupHandler from './handlers/PopupHandler';

export default class RequestService {
  readonly popupHandler: PopupHandler;
  readonly connectWCRequestHandler: ConnectWCRequestHandler;
  readonly notSupportWCRequestHandler: NotSupportWCRequestHandler;

  constructor() {
    this.popupHandler = new PopupHandler(this);
    this.connectWCRequestHandler = new ConnectWCRequestHandler(this);
    this.notSupportWCRequestHandler = new NotSupportWCRequestHandler(this);
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
      // this.numMetaRequests +
      // this.numAuthRequests +
      // this.numSubstrateRequests +
      // this.numEvmRequests +
      this.numConnectWCRequests + this.numNotSupportWCRequests
    );
  }
}
