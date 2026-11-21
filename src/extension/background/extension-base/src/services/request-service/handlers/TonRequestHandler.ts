import { BehaviorSubject } from 'rxjs';
import { createSigningRequestId } from '@extension-base/services/request-service/signingRequestId';
import { siteApprovalsInProgress, siteTransactionsBeingSent } from '@extension-base/services/request-service/siteApprovals';
import type { RequestService } from '@extension-base/services/request-service';
import type {
  TonRequestPayload,
  TonRequests,
  TonRequestsSubject,
  TonRequestsSubjectPayload,
  TonSigningResponse,
} from '@extension-base/services/request-service/types';
import type { ParsedSignData, TonConnectTransaction } from '@/util/tonConnect/protocol';

/** The most TON Connect requests that may wait at once; a page that floods the queue is refused. */
const MAX_PENDING = 16;

/** The queue of TON Connect transactions and signData requests the popup reviews. */
export default class TonRequestHandler {
  private readonly tonRequests: TonRequestsSubject = {};
  public readonly signTonSubject = new BehaviorSubject<TonRequests>({});

  constructor(private readonly requestService: RequestService) {}

  get numTonSignRequest(): number {
    return Object.keys(this.tonRequests).length;
  }

  resetWallet(): void {
    this.cancelPending(new Error('Reset wallet'));
  }

  cancelPending(error: Error): void {
    for (const request of Object.values(this.tonRequests)) {
      // A transaction being sent settles with its own outcome: the dApp must not be told it was cancelled.
      if (!siteTransactionsBeingSent.has(request)) request.reject(error);
    }
  }

  getTonSignRequest(id: string): TonRequestsSubjectPayload | undefined {
    return this.tonRequests[id];
  }

  queue(
    payload: Omit<TonRequestPayload, 'id' | 'ecosystem'>,
    validated: { transaction?: TonConnectTransaction; signDataRequest?: ParsedSignData },
    signal?: AbortSignal,
    id = createSigningRequestId('ton')
  ): Promise<TonSigningResponse> {
    return new Promise<TonSigningResponse>((resolve, reject): void => {
      if (this.tonRequests[id] || this.requestService.hasSigningRequest?.(id)) throw new Error('Duplicate TON request ID');
      if (signal?.aborted) throw new Error('Cancelled');
      if (this.numTonSignRequest >= MAX_PENDING) throw new Error('Too many TON requests are waiting');

      let settled = false;
      // A closed page drops its request as Reject would, unless an approval may already be sending it.
      const cancel = () => {
        if (queued.method !== 'sendTransaction' || !siteApprovalsInProgress.has(queued)) queued.reject(new Error('Cancelled'));
      };
      const complete = () => {
        if (settled || this.tonRequests[id] !== queued) return false;
        settled = true;
        signal?.removeEventListener('abort', cancel);
        delete this.tonRequests[id];
        this.publish(true);

        return true;
      };
      const queued: TonRequestsSubjectPayload = {
        ...structuredClone(payload),
        ecosystem: 'ton',
        id,
        ...validated,
        resolve: (result) => {
          if (complete()) resolve(result);
        },
        reject: (error) => {
          if (complete()) reject(error);
        },
      };

      this.tonRequests[id] = queued;
      signal?.addEventListener('abort', cancel, { once: true });
      this.publish();
      this.requestService.popupOpen();
    });
  }

  private publish(shouldClose?: boolean): void {
    this.signTonSubject.next(this.publicRequests);
    this.requestService.updateIcon(shouldClose);
  }

  private get publicRequests(): TonRequests {
    return Object.fromEntries(
      Object.entries(this.tonRequests).map(
        ([id, { reject: _reject, resolve: _resolve, transaction: _transaction, signDataRequest: _signData, ...request }]) => [
          id,
          structuredClone(request),
        ]
      )
    );
  }
}
