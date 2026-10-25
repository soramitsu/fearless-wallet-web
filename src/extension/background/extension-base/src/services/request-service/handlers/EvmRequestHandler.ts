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
import type {
  WalletConnectTransactionRequest,
  WalletConnectSigningContext,
} from '@extension-base/services/wallet-connect-service/types';
import type { ResponseSigning } from '@extension-base/background/types/types';
import type { SignClientTypes } from '@walletconnect/types';

export default class EvmRequestHandler {
  private readonly requestService: RequestService;
  private readonly wcRequests = new Map<string, WCSignRequest>();
  private evmRequests: EvmRequestsSubject = {};
  private readonly pendingApprovals = new WeakSet<EvmRequestsSubjectPayload>();
  private readonly pendingWcApprovals = new WeakSet<WCSignRequest>();
  public readonly signWcSubject = new BehaviorSubject<WalletConnectTransactionRequest[]>([]);
  public readonly signEvmSubject = new BehaviorSubject<EvmRequests>({});

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }

  get numWcSignRequest() {
    return this.wcRequests.size;
  }

  get numEvmSignRequest(): number {
    return Object.keys(this.evmRequests).length;
  }

  resetWallet(): void {
    for (const request of Object.values(this.evmRequests)) request.reject(new Error('Reset wallet'));
    for (const request of [...this.wcRequests.values()]) request.reject(new Error('Reset wallet'));
  }

  getSignWCRequest(approvalId: string): WCSignRequest | undefined {
    return this.wcRequests.get(approvalId);
  }

  claimWCSignRequest(approvalId: string): WCSignRequest {
    const request = this.wcRequests.get(approvalId);
    if (!request || this.pendingWcApprovals.has(request))
      throw new Error('WalletConnect request unavailable or already pending');
    this.pendingWcApprovals.add(request);
    return request;
  }

  releaseWCSignRequest(request: WCSignRequest): void {
    this.pendingWcApprovals.delete(request);
  }

  rejectWCSignRequest(approvalId: string): boolean {
    const request = this.wcRequests.get(approvalId);
    if (!request) return false;
    if (this.pendingWcApprovals.has(request)) throw new Error('WalletConnect approval already pending');
    request.reject(new Error('USER_REJECTED'));
    return true;
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
          const { data, method, url, account, network, authorizationRevision } = request;
          return [id, structuredClone({ id, data, method, url, account, network, authorizationRevision })];
        })
      )
    );
  }

  get allWcSignRequests(): WalletConnectTransactionRequest[] {
    return [...this.wcRequests.values()].map(({ request }) => structuredClone(request));
  }

  onComplete(id: string, type: 'wcRequests' | 'evmRequests') {
    if (type === 'wcRequests') this.wcRequests.delete(id);
    else delete this.evmRequests[id];

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
      if (this.requestService.keyringService?.isResetting) throw new Error('Wallet reset is in progress');
      const authorization = this.requestService.authRequestHandler?.getEvmAuthorizationSnapshot(url);
      if (authorization && authorization.revision !== context.authorizationRevision)
        throw new Error('Signing authorization changed; request approval again');
      if (this.evmRequests[id] || this.requestService.hasSigningRequest?.(id)) throw new Error('Duplicate EVM request ID');
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

  onWCSign(
    event: SignClientTypes.EventArguments['session_request'],
    context?: WalletConnectSigningContext
  ): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      if (this.requestService.keyringService?.isResetting) throw new Error('Wallet reset is in progress');
      if (typeof event.topic !== 'string' || !event.topic || !Number.isSafeInteger(event.id) || event.id < 0)
        throw new Error('Invalid WalletConnect request identity');
      if ([...this.wcRequests.values()].some(({ request }) => request.topic === event.topic && request.id === event.id))
        throw new Error('Duplicate WalletConnect request ID');
      const approvalId = crypto.randomUUID();
      const snapshot = {
        ...structuredClone(event),
        approvalId,
        ...(context ? { context: structuredClone(context) } : {}),
      };
      let settled = false;
      const complete = () => {
        if (settled || this.wcRequests.get(approvalId) !== request) return false;
        settled = true;
        this.onComplete(approvalId, 'wcRequests');
        return true;
      };
      const request: WCSignRequest = {
        request: snapshot,
        resolve: (result) => {
          if (complete()) resolve(result);
        },
        reject: (error) => {
          if (complete()) reject(error);
        },
      };
      this.wcRequests.set(approvalId, request);
      this.signWcSubject.next(this.allWcSignRequests);
      this.requestService.updateIcon();
      this.requestService.popupOpen();
    });
  }
}
