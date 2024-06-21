import { BehaviorSubject } from 'rxjs';
import { logger as createLogger } from '@polkadot/util/logger';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import { getId, isInternalRequest } from '@extension-base/utils';
import type { Logger } from '@polkadot/util/types';
import type { SignerPayloadJSON } from '@polkadot/types/types/extrinsic';
import type {
  Resolver,
  SignRequest,
  ResponseSigning,
  RequestSign,
  AccountJson,
  SigningRequest,
} from '@extension-base/background/types/types';
import type { KeyringService, RequestService } from '@extension-base/services';
import type State from '@extension-base/background/handlers/State';

export class SubstrateRequestHandler {
  readonly logger: Logger;

  readonly substrateRequests: Record<string, SignRequest> = {};
  public readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);

  constructor(
    private readonly requestService: RequestService,
    private readonly keyringService: KeyringService,
    public readonly state: State
  ) {
    this.logger = createLogger('SubstrateRequestHandler');
  }

  public getSignRequest(id: string): SignRequest | undefined {
    return this.substrateRequests[id];
  }

  public get allSubstrateRequests(): SigningRequest[] {
    return Object.values(this.substrateRequests).map(({ account, id, request, url }) => ({
      account,
      id,
      request,
      url,
      isInternal: isInternalRequest(url),
    }));
  }

  private updateIconSign(shouldClose?: boolean): void {
    this.signSubject.next(this.allSubstrateRequests);
    this.requestService.updateIcon(shouldClose);
  }

  private signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = (): void => {
      delete this.substrateRequests[id];

      this.updateIconSign(true);
    };

    return {
      reject: (error: Error): void => {
        this.logger.log(error);

        complete();
        reject(error);
      },
      resolve: (result: ResponseSigning): void => {
        complete();
        resolve(result);
      },
    };
  };

  public get numSubstrateRequests(): number {
    return Object.keys(this.substrateRequests).length;
  }

  public sign(url: string, request: RequestSign, account: AccountJson, _id?: string): Promise<ResponseSigning> {
    const id = _id || getId();

    return new Promise((resolve, reject): void => {
      this.substrateRequests[id] = {
        ...this.signComplete(id, resolve, reject),
        account,
        id,
        request,
        url,
      };

      this.updateIconSign();
      this.requestService.popupOpen();
    });
  }

  public signTransaction(
    id: string,
    address: string,
    url: string,
    payload: SignerPayloadJSON
  ): Promise<ResponseSigning> {
    return new Promise((resolve, reject): void => {
      const existingAccount = this.keyringService.getAccounts().find((el) => el.address === address);

      if (!existingAccount) return reject();

      const account: AccountJson = {
        address: existingAccount.address,
        name: existingAccount.meta.name as string,
        ethereumAddress: (existingAccount.meta.ethereumAddress as string) ?? '',
        ...existingAccount.meta,
      };

      this.substrateRequests[id] = {
        ...this.signComplete(id, resolve, reject),
        account,
        id,
        request: new RequestExtrinsicSign(payload, this.state),
        url,
      };

      this.updateIconSign();

      if (!isInternalRequest(url)) this.requestService.popupOpen();
    });
  }

  public resetWallet() {
    for (const request of Object.values(this.substrateRequests)) request.reject(new Error('Reset wallet'));

    this.signSubject.next([]);
  }
}
