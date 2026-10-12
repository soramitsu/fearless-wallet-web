import { BehaviorSubject } from 'rxjs';
import type { RequestService } from '@extension-base/services/request-service';
import type {
  EvmRequestParams,
  EvmRequests,
  EvmRequestsSubject,
  EvmRequestsSubjectPayload,
  EvmSigningContext,
  WCSignRequest,
} from '@extension-base/services/request-service/types';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { Resolver, ResponseSigning } from '@extension-base/background/types/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private wcRequests: Record<string, WCSignRequest> = {};
  private evmRequests: EvmRequestsSubject = {};
  private readonly pendingApprovals = new WeakSet<EvmRequestsSubjectPayload>();
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

  claimEvmSignRequest(id: string): EvmRequestsSubjectPayload {
    const request = this.evmRequests[id];
    if (!request || this.pendingApprovals.has(request)) throw new Error('EVM request unavailable or already pending');
    this.pendingApprovals.add(request);
    return request;
  }

  releaseEvmSignRequest(request: EvmRequestsSubjectPayload): void {
    this.pendingApprovals.delete(request);
  }

  private publishEvmRequests(): void {
    this.signEvmSubject.next(
      Object.fromEntries(
        Object.entries(this.evmRequests).map(([id, request]) => {
          const { data, method, url, account, network } = request;
          return [id, structuredClone({ id, data, method, url, account, network })];
        })
      )
    );
  }

  get allWcSignRequests(): WalletConnectTransactionRequest[] {
    return Object.values(this.wcRequests).map(({ request }): WalletConnectTransactionRequest => ({ ...request }));
  }

  onComplete(id: string, type: 'wcRequests' | 'evmRequests') {
    delete this[type][id];

    this.requestService.updateIcon(true);

    if (type === 'wcRequests') this.signWcSubject.next([...this.allWcSignRequests]);
    else if (type === 'evmRequests') this.publishEvmRequests();
  }

  confirmSign(
    id: string,
    url: string,
    method: string,
    params: EvmRequestParams,
    context: EvmSigningContext
  ): Promise<ResponseSigning> {
    return new Promise<ResponseSigning>((resolve, reject): void => {
      if (this.evmRequests[id]) throw new Error('Duplicate EVM request ID');
      const snapshot = structuredClone({ url, method, data: params, id, ...context });
      let settled = false;
      const complete = () => {
        if (settled || this.evmRequests[id] !== request) return false;
        settled = true;
        this.onComplete(id, 'evmRequests');
        return true;
      };
      const request: EvmRequestsSubjectPayload = {
        ...snapshot,
        resolve: (result) => {
          if (complete()) resolve(result);
        },
        reject: (error) => {
          if (complete()) reject(error);
        },
      };
      this.evmRequests[id] = request;
      this.publishEvmRequests();

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
