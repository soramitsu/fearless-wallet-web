import { BehaviorSubject } from 'rxjs';
import type { RequestService } from '@extension-base/services/request-service';
import type { WCSignRequest } from '@extension-base/services/request-service/types';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private wcRequests: Record<string, WCSignRequest> = {};
  public readonly signSubject = new BehaviorSubject<WalletConnectTransactionRequest[]>([]);

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

  public sign(request: WalletConnectTransactionRequest): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      this.wcRequests[request.topic] = {
        ...this.signComplete(request.topic, resolve, reject),
        request,
      };

      this.requestService.updateIcon();
      this.requestService.popupOpen();

      const values = this.signSubject.getValue();

      this.signSubject.next([...values, request]);
    });
  }

  private signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = (): void => {
      delete this.wcRequests[id];
      this.requestService.updateIcon(true);

      this.signSubject.next([...this.allWcSignRequests]);
    };

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
