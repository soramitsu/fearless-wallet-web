import { BehaviorSubject } from 'rxjs';
import type { RequestService } from '@extension-base/services/request-service';
import type {
  EvmRequestParams,
  EvmRequests,
  EvmRequestsSubject,
  WCSignRequest,
} from '@extension-base/services/request-service/types';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private wcRequests: Record<string, WCSignRequest> = {};
  private evmRequests: EvmRequestsSubject = {};
  public readonly signWcSubject = new BehaviorSubject<WalletConnectTransactionRequest[]>([]);
  public readonly signEvmSubject = new BehaviorSubject<EvmRequests>({});

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  get numWcSignRequest() {
    return Object.keys(this.wcRequests).length;
  }

  getSignWCRequest(id: string): WCSignRequest {
    return this.wcRequests[id];
  }

  getEvmSignRequest(id: string) {
    return this.evmRequests[id];
  }

  get allWcSignRequests(): WalletConnectTransactionRequest[] {
    return Object.values(this.wcRequests).map(({ request }): WalletConnectTransactionRequest => ({ ...request }));
  }

  onComplete(id: string, type: 'wcRequests' | 'evmRequests') {
    delete this[type][id];

    this.requestService.updateIcon(true);

    if (type === 'wcRequests') this.signWcSubject.next([...this.allWcSignRequests]);
    else if (type === 'evmRequests') this.signEvmSubject.next(this.evmRequests);
  }

  confirmSign(id: string, url: string, method: string, params: EvmRequestParams): Promise<ResponseSigning> {
    const complete = () => this.onComplete(id, 'evmRequests');
    const values = this.signEvmSubject.getValue();

    return new Promise<ResponseSigning>((resolve, reject): void => {
      this.signEvmSubject.next({ ...values, [id]: { url, data: params, id } });

      this.evmRequests[id] = { ...this.signComplete(complete, resolve, reject), url, method, data: params, id };

      this.requestService.updateIcon();
      this.requestService.popupOpen();
    });
  }

  onWCSign(request: WalletConnectTransactionRequest): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      const complete = () => this.onComplete(request.topic, 'wcRequests');

      this.wcRequests[request.topic] = {
        ...this.signComplete(complete, resolve, reject),
        request,
      };

      this.requestService.updateIcon();
      this.requestService.popupOpen();

      const values = this.signWcSubject.getValue();

      this.signWcSubject.next([...values, request]);
    });
  }

  private signComplete = (
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
