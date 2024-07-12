import { BehaviorSubject } from 'rxjs';
import type { RequestService } from '@extension-base/services';
import type {
  RequestWalletConnectSession,
  WalletConnectSessionRequest,
} from '@extension-base/services/wallet-connect-service/types';
import type { Resolver } from '@extension-base/background/types/types';

// WC = WalletConnect
export class ConnectWCRequestHandler {
  private readonly requestService: RequestService;
  public readonly connectWCRequests: Record<string, RequestWalletConnectSession> = {};
  public readonly connectWCSubject = new BehaviorSubject<WalletConnectSessionRequest[]>([]);

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  public get allConnectWCRequests(): WalletConnectSessionRequest[] {
    return (
      Object.values(this.connectWCRequests)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ reject, resolve, ...data }) => data)
    );
  }

  public get numConnectWCRequests(): number {
    return Object.keys(this.connectWCRequests).length;
  }

  public getConnectWCRequest(id: string): RequestWalletConnectSession {
    return this.connectWCRequests[id];
  }

  private updateIconConnectWC(shouldClose?: boolean): void {
    this.connectWCSubject.next(this.allConnectWCRequests);
    this.requestService.updateIcon(shouldClose);
  }

  private connectWCComplete = (id: string): Resolver<void> => {
    const complete = (shouldClose: boolean): void => {
      delete this.connectWCRequests[id];
      this.updateIconConnectWC(shouldClose);
    };

    return {
      reject: (): void => {
        complete(true);
      },
      resolve: (): void => {
        complete(true);
      },
    };
  };

  public addConnectWCRequest(request: WalletConnectSessionRequest) {
    const id = request.id;

    this.connectWCRequests[id] = {
      ...this.connectWCComplete(id),
      ...request,
    };

    this.updateIconConnectWC();
  }

  public resetWallet() {
    for (const request of Object.values(this.connectWCRequests)) {
      request.reject(new Error('Reset wallet'));
    }

    this.connectWCSubject.next([]);
  }
}
