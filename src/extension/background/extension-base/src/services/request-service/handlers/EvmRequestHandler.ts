import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import { WalletConnectTransactionRequest } from '../../wallet-connect-service/types';
import { Resolver, ResponseSigning } from '../../../background/types';
// import { storage } from '../../../stores/Storage';
import { WCSignRequest } from '../types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private wcRequests: Record<string, WCSignRequest> = {};
  public readonly signSubject: BehaviorSubject<WalletConnectTransactionRequest[]> = new BehaviorSubject<
    WalletConnectTransactionRequest[]
  >([]);

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
      const values = this.signSubject.getValue();
      this.signSubject.next([...values, request]);

      this.requestService.popupOpen();
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
