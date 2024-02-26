import { BehaviorSubject } from 'rxjs';
import type { RequestService } from '@extension-base/services/request-service';
import type { WCSignRequest } from '@extension-base/services/request-service/types';
import type {
  ConfirmationsEvmQueue,
  WalletConnectTransactionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private wcRequests: Record<string, WCSignRequest> = {};
  private evmRequests: ConfirmationsEvmQueue = {
    sendTxRequest: {},
    signMessageRequest: {},
  };
  public readonly signWcSubject = new BehaviorSubject<WalletConnectTransactionRequest[]>([]);
  public readonly confirmationMapSubject = new BehaviorSubject<ConfirmationsEvmQueue>({
    sendTxRequest: {},
    signMessageRequest: {},
  });

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  public get numWcSignRequest() {
    return Object.keys(this.wcRequests).length;
  }

  public getSignWCRequest(id: string): WCSignRequest {
    return this.wcRequests[id];
  }

  public get allWcSignRequests(): WalletConnectTransactionRequest[] {
    return Object.values(this.wcRequests).map(({ request }): WalletConnectTransactionRequest => ({ ...request }));
  }

  private onIncomingRequest() {
    this.requestService.updateIcon();
    this.requestService.popupOpen();
  }

  onWcComplete(id: string) {
    delete this.wcRequests[id];

    this.requestService.updateIcon(true);

    this.signWcSubject.next([...this.allWcSignRequests]);
  }

  onSignComplete(id: string, type: 'signMessageRequest' | 'sendTxRequest') {
    const values = this.confirmationMapSubject.getValue();

    delete values[type][id];

    this.requestService.updateIcon(true);
    this.confirmationMapSubject.next(values);
  }

  getRequestType(method: string): 'signMessageRequest' | 'sendTxRequest' {
    switch (method) {
      case 'eth_sign':
      case 'personal_sign':
      case 'eth_signTypedData':
      case 'eth_signTypedData_v1':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4':
        return 'signMessageRequest';

      default:
        return 'sendTxRequest';
    }
  }

  public confirmSign(id: string, url: string, method: string, params: any): Promise<ResponseSigning> {
    const type = this.getRequestType(method);
    const complete = () => this.onSignComplete(id, type);
    const values = this.confirmationMapSubject.getValue();

    return new Promise<ResponseSigning>((resolve, reject): void => {
      this.confirmationMapSubject.next({
        ...values,
        [type]: {
          ...values.sendTxRequest,
          [id]: { ...this.signComplete(id, complete, resolve, reject), url, data: params, id },
        },
      });

      this.onIncomingRequest();
    });
  }

  public onWCSign(request: WalletConnectTransactionRequest): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      const complete = () => this.onWcComplete(request.topic);
      this.wcRequests[request.topic] = {
        ...this.signComplete(request.topic, complete, resolve, reject),
        request,
      };

      this.requestService.updateIcon();
      this.requestService.popupOpen();

      const values = this.signWcSubject.getValue();

      this.signWcSubject.next([...values, request]);
    });
  }

  private signComplete = (
    id: string,
    complete: () => void,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    return {
      reject: (error: Error): void => {
        complete();
        console.info(error);
        reject(error);
      },
      resolve: (result: ResponseSigning): void => {
        complete();
        resolve(result);
      },
    };
  };
}
