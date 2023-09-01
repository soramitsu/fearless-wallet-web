import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import { WalletConnectTransactionRequest } from '../../wallet-connect-service/types';
import { Resolver, ResponseSigning } from '../../../background/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  readonly wcRequests: Record<string, WalletConnectTransactionRequest> = {};
  public readonly signSubject: BehaviorSubject<WalletConnectTransactionRequest[]> = new BehaviorSubject<
    WalletConnectTransactionRequest[]
  >([]);

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  public sign(request: WalletConnectTransactionRequest): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      this.wcRequests[request.topic] = {
        ...request,
        ...this.signComplete(request.topic, resolve, reject),
      };

      this.requestService.updateIcon();
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
