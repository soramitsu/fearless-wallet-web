import { BehaviorSubject } from 'rxjs';
import { logger as createLogger } from '@polkadot/util/logger';
import { getId } from '@extension-base/utils';
import { captureSubstrateSigningContext } from './substrateSigningContext';
import type { Logger } from '@polkadot/util/types';
import type {
  SignRequest,
  ResponseSigning,
  RequestSign,
  AccountJson,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { RequestService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';

export class SubstrateRequestHandler {
  readonly logger: Logger;
  private readonly substrateRequests: Record<string, SignRequest> = {};
  public readonly signSubject = new BehaviorSubject<SigningRequest[]>([]);

  constructor(
    private readonly requestService: RequestService,
    public readonly state: State
  ) {
    this.logger = createLogger('SubstrateRequestHandler');
  }

  public getSignRequest(id: string): SignRequest | undefined {
    return this.substrateRequests[id];
  }

  public get allSubstrateRequests(): SigningRequest[] {
    return Object.values(this.substrateRequests).map(({ account, id, request, url, signingContext }) =>
      structuredClone({
        account,
        id,
        request: { payload: request.payload },
        url,
        ...(signingContext?.kind === 'extrinsic' ? { network: signingContext.network } : {}),
      })
    );
  }

  private updateIconSign(shouldClose?: boolean): void {
    this.signSubject.next(this.allSubstrateRequests);
    this.requestService.updateIcon(shouldClose);
  }

  public get numSubstrateRequests(): number {
    return Object.keys(this.substrateRequests).length;
  }

  public async sign(url: string, request: RequestSign, account: AccountJson, _id?: string): Promise<ResponseSigning> {
    // Capture caller-owned data before the authorization load can yield.
    const snapshot = structuredClone({ account, url });
    const signer = request.snapshot();
    await this.requestService.ensureAccountAuthorized(url, snapshot.account.address);
    const authorizationRevision = this.requestService.authRequestHandler.getSigningAuthorizationRevision(
      snapshot.url,
      'substrate',
      snapshot.account.address
    );
    const signingContext = captureSubstrateSigningContext(this.state, this.requestService, signer.payload);
    const id = _id || getId();

    return new Promise((resolve, reject): void => {
      if (this.substrateRequests[id]) throw new Error('Duplicate Substrate request ID');
      let settled = false;
      const complete = () => {
        if (settled || this.substrateRequests[id] !== queued) return false;
        settled = true;
        delete this.substrateRequests[id];
        this.updateIconSign(true);
        return true;
      };
      const queued: SignRequest = {
        authorizationRevision,
        signingContext,
        account: snapshot.account,
        id,
        request: signer,
        url: snapshot.url,
        resolve: (result) => {
          if (complete()) resolve(result);
        },
        reject: (error) => {
          if (complete()) {
            this.logger.log(error);
            reject(error);
          }
        },
      };
      this.substrateRequests[id] = queued;

      this.updateIconSign();
      this.requestService.popupOpen();
    });
  }

  public resetWallet() {
    for (const request of Object.values(this.substrateRequests)) request.reject(new Error('Reset wallet'));

    this.signSubject.next([]);
  }
}
