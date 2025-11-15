import { BehaviorSubject } from 'rxjs';
import { assert } from '@polkadot/util';
import AuthorizeStore from '@extension-base/stores/Authorize';
import { getId } from '@extension-base/utils';
import { type DAppChainInfoPayload } from '@extension-base/services/request-service/types';
import { type NetworkJson } from '@extension-base/types';
import type State from '@extension-base/background/handlers/State';
import type {
  Resolver,
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  RequestAuthorizeTab,
  AuthUrlInfo,
} from '@extension-base/background/types/types';
import type { KeyringService, NetworkService, RequestService } from '@extension-base/services';
import { stripUrl } from '@/extension/background/extension-base/src/background/helpers';
import { isSameString } from '@/helpers';

const AUTH_URLS_KEY = 'authUrls';

export class AuthRequestHandler {
  private readonly requestService: RequestService;
  private readonly networkService: NetworkService;
  private readonly keyringService: KeyringService;

  readonly authRequests: Record<string, AuthRequest> = {};
  private authorizeCached: AuthUrls = {};
  private readonly authorizeStore = new AuthorizeStore();
  private readonly evmChainSubject = new BehaviorSubject<AuthUrls>({});
  private readonly authorizeUrlSubject = new BehaviorSubject<AuthUrls>({});
  public readonly authSubject = new BehaviorSubject<AuthorizeRequest[]>([]);

  constructor(requestService: RequestService, state: State) {
    this.getAuthorize((auths) => (this.authorizeCached = auths ?? {}));

    this.requestService = requestService;
    this.networkService = state.networkService;
    this.keyringService = state.keyringService;
  }

  public get numAuthRequests(): number {
    return Object.keys(this.authRequests).length;
  }

  private get authValues() {
    return Object.values(this.authRequests);
  }

  public get subscribeEvmChainChange() {
    return this.evmChainSubject;
  }

  public get subscribeAuthorizeUrlSubject() {
    return this.authorizeUrlSubject;
  }

  private get allAuthRequests(): AuthorizeRequest[] {
    return this.authValues.map(
      ({ id, request, url, accountAuthType }): AuthorizeRequest => ({
        id,
        request,
        url,
        accountAuthType: accountAuthType ?? 'substrate',
      })
    );
  }

  private updateIconAuth(shouldClose?: boolean): void {
    this.authSubject.next(this.allAuthRequests);
    this.requestService.updateIcon(shouldClose);
  }

  public setAuthorize(data: AuthUrls, callback?: () => void): void {
    this.authorizeStore.set(AUTH_URLS_KEY, data, () => {
      this.authorizeCached = data;

      this.authorizeUrlSubject.next(this.authorizeCached);

      callback?.();
    });
  }

  public getAuthorize(update: (value: AuthUrls) => void): void {
    // This action can be use many by DApp interaction => caching it in memory
    if (Object.keys(this.authorizeCached).length) update(this.authorizeCached);
    else
      this.authorizeStore.get('authUrls', (data) => {
        this.authorizeCached = data || {};
        this.authorizeUrlSubject.next(this.authorizeCached);

        update(this.authorizeCached);
      });
  }

  public getAuthList(): Promise<AuthUrls> {
    return new Promise<AuthUrls>((resolve) => this.getAuthorize((rs: AuthUrls) => resolve(rs ?? {})));
  }

  public authComplete = (
    id: string,
    existedAuth: AuthUrlInfo,
    resolve: (resValue: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (_authorizedAccounts: string[] = [], isAllowed = true) => {
      const {
        id: idStr,
        request: { origin },
        accountAuthType,
        url,
        currentEvmNetworkKey,
      } = this.authRequests[id];

      if (!isAllowed) {
        delete this.authRequests[id];

        this.updateIconAuth(true);

        return;
      }

      const stripedUrl = stripUrl(url);

      const substrateAccount = this.keyringService.getAccount(_authorizedAccounts[0]);
      const ethereumAddress = substrateAccount?.meta.ethereumAddress as string;

      const evmAuthorizedAccount =
        accountAuthType !== 'substrate' ? ethereumAddress : (existedAuth?.evmAuthorizedAccount ?? '');

      const authorizedAccounts =
        accountAuthType !== 'evm' ? _authorizedAccounts : (existedAuth?.authorizedAccounts ?? []);

      this.authorizeCached[stripedUrl] = {
        authorizedAccounts,
        evmAuthorizedAccount,
        count: 0,
        isAllowed: true,
        accountAuthType,
        allowedAccountsMap: {},
        id: idStr,
        origin,
        url,
        currentEvmNetworkKey,
      };

      this.setAuthorize(this.authorizeCached);

      delete this.authRequests[id];

      this.updateIconAuth(true);
    };

    return {
      resolve: ({ authorizedAccounts }: AuthResponse): void => {
        complete(authorizedAccounts);
        resolve(true);
      },
      reject: (error: Error): void => {
        complete([], false);
        reject(error);
      },
    };
  };

  public async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<boolean> {
    const authList = await this.getAuthList();

    const accountAuthType = request.accountAuthType ?? 'substrate';

    request.accountAuthType = accountAuthType;

    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = this.authValues.some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    const existedAuth = authList[idStr];
    const existedAccountAuthType = existedAuth?.accountAuthType;
    const isNewType = existedAccountAuthType !== 'both' && existedAccountAuthType !== request.accountAuthType;

    if (request.accountAuthType === 'evm') {
      if (existedAuth && existedAuth?.evmAuthorizedAccount !== '' && !request.reConfirm) return false;
    }
    // Reconfirm if check auth for empty list
    else if (existedAuth) {
      if (request.reConfirm) request.origin = existedAuth.origin;

      const inBlackList = !(existedAuth?.isAllowed ?? true);

      if (inBlackList) throw new Error(`The source ${url} is not allowed to interact with this extension`);

      const allowedListByRequestType = existedAuth.authorizedAccounts;

      // Prevent appear confirmation popup
      if (!isNewType && !request.reConfirm && allowedListByRequestType.length !== 0) return false;
    }

    return new Promise((resolve, reject): void => {
      const id = getId();

      this.authRequests[id] = {
        ...this.authComplete(id, existedAuth, resolve, reject),
        id,
        idStr,
        request,
        url,
        accountAuthType: existedAuth && existedAuth.accountAuthType !== accountAuthType ? 'both' : accountAuthType,
        currentEvmNetworkKey: existedAuth ? existedAuth.currentEvmNetworkKey : 'Ethereum',
      };

      this.updateIconAuth();

      if (Object.keys(this.authRequests).length < 2) this.requestService.popupOpen();
    });
  }

  public getAuthRequest(id: string): AuthRequest {
    return this.authRequests[id];
  }

  public ensureUrlAuthorized(url: string): Promise<boolean> {
    const idStr = stripUrl(url);

    return new Promise((resolve, reject) => {
      this.getAuthorize((authUrls) => {
        const entry = Object.keys(authUrls).includes(idStr);

        if (!entry) reject(new Error(`The source ${url} has not been enabled yet`));

        resolve(true);
      });
    });
  }

  getEvmNetworkInfo(options: DAppChainInfoPayload): NetworkJson | undefined {
    const networks = this.networkService.activeNetworkByEcosystem.evm;
    const defaultChain = options.defaultChain;

    if (defaultChain) return networks.find(({ name }) => isSameString(name, defaultChain)) ?? networks[0];

    const evmActiveNetwork = networks.find(({ active }) => active);

    return evmActiveNetwork ?? networks[0];
  }

  public resetWallet() {
    for (const request of this.authValues) request.reject(new Error('Reset wallet'));

    this.authSubject.next([]);
    this.setAuthorize({});
  }
}
