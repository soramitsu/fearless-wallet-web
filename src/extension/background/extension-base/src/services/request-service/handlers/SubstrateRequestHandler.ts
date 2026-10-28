import {
  validatePolkadotSigningContext,
  polkadotSigningPayload,
  type PolkadotSigningContext,
} from '@extension-base/services/wallet-connect-service/polkadotSigningContext';
import { BehaviorSubject } from 'rxjs';
import { logger as createLogger } from '@polkadot/util/logger';
import { createSigningRequestId } from '@extension-base/services/request-service/signingRequestId';
import RequestBytesSign from '@extension-base/signers/RequestBytesSign';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import { captureSubstrateSigningContext, validateSubstrateSigningContext } from './substrateSigningContext';
import { captureSubstrateSigningAccount, validateSubstrateSigningAccount } from './substrateSigningAccount';
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
        ...(signingContext?.kind === 'extrinsic'
          ? { network: signingContext.network, callReview: signingContext.callReview }
          : {}),
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

  public signWalletConnect(context: PolkadotSigningContext) {
    const snapshot = structuredClone(context);
    const payload = polkadotSigningPayload(snapshot.event);
    const signer = 'data' in payload ? new RequestBytesSign(payload) : new RequestExtrinsicSign(payload);
    const id = `wallet-connect.${crypto.randomUUID()}`;
    // Session admission captures and queues synchronously; only ordinary site
    // admission waits for its permission store. Retain the exact private record
    // so every captured context can be checked at the eventual remote response.
    const result = this.sign(
      snapshot.origin,
      signer,
      { address: payload.address, name: '', ethereumAddress: '' },
      id,
      snapshot
    );
    const queued = this.substrateRequests[id];
    return {
      result,
      validate: () => {
        if (!queued?.walletConnectContext) throw new Error('WalletConnect signing context is unavailable');
        validatePolkadotSigningContext(this.state, queued.walletConnectContext, queued.request.payload, queued.url);
        validateSubstrateSigningContext(this.state, queued);
        validateSubstrateSigningAccount(this.state, queued);
      },
    };
  }

  public async sign(
    url: string,
    request: RequestSign,
    account: AccountJson,
    _id?: string,
    walletConnectContext?: PolkadotSigningContext
  ): Promise<ResponseSigning> {
    const resetRevision = this.state.keyringService.walletResetRevision;
    if (this.state.keyringService.isResetting) throw new Error('Wallet reset is in progress');
    // Capture caller-owned data before the authorization load can yield.
    const snapshot = structuredClone({ account, url, walletConnectContext });
    const signer = request.snapshot();
    let authorizationRevision: number | undefined;
    if (snapshot.walletConnectContext) {
      validatePolkadotSigningContext(this.state, snapshot.walletConnectContext, signer.payload, snapshot.url);
    } else {
      await this.requestService.ensureAccountAuthorized(url, snapshot.account.address);
      authorizationRevision = this.requestService.authRequestHandler.getSigningAuthorizationRevision(
        snapshot.url,
        'substrate',
        snapshot.account.address
      );
    }
    if (this.state.keyringService.isResetting || this.state.keyringService.walletResetRevision !== resetRevision)
      throw new Error('Wallet changed during signing admission');
    const signingContext = captureSubstrateSigningContext(this.state, this.requestService, signer.payload);
    const signingAccount = captureSubstrateSigningAccount(this.state, signer, snapshot.account);
    snapshot.account.address = signingAccount.address;
    snapshot.account.name = signingAccount.name;
    snapshot.account.isMobile = signingAccount.kind === 'mobile';
    const id = _id || createSigningRequestId('substrate');

    return new Promise((resolve, reject): void => {
      if (this.substrateRequests[id] || this.requestService.hasSigningRequest?.(id)) throw new Error('Duplicate Substrate request ID');
      let settled = false;
      const complete = () => {
        if (settled || this.substrateRequests[id] !== queued) return false;
        settled = true;
        delete this.substrateRequests[id];
        this.updateIconSign(true);
        return true;
      };
      const queued: SignRequest = {
        walletConnectContext: snapshot.walletConnectContext,
        authorizationRevision,
        signingContext,
        signingAccount,
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
    this.cancelPending(new Error('Reset wallet'));
  }

  public cancelPending(error: Error): void {
    for (const request of Object.values(this.substrateRequests)) request.reject(error);

    this.signSubject.next([]);
  }
}
