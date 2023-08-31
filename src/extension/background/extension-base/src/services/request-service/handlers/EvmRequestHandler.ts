import { BehaviorSubject } from 'rxjs';
import { RequestService } from '..';
import { SignRequest, SigningRequest } from '../../../background/types';

export default class EvmRequestHandler {
  readonly requestService: RequestService;
  readonly substrateRequests: Record<string, SignRequest> = {};
  public readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);

  constructor(requestService: RequestService) {
    this.requestService = requestService;
  }
}
