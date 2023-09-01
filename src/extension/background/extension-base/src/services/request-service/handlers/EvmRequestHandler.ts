import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import { WalletConnectTransactionRequest } from '../../wallet-connect-service/types';

export default class EvmRequestHandler {
  readonly requestService: RequestService;
  readonly substrateRequests: Record<string, WalletConnectTransactionRequest> = {};
  public readonly signSubject: BehaviorSubject<WalletConnectTransactionRequest[]> = new BehaviorSubject<
    WalletConnectTransactionRequest[]
  >([]);

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }
}
