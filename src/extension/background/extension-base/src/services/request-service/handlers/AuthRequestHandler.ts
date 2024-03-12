import { BehaviorSubject } from 'rxjs';
import { assert } from '@polkadot/util';
import { stripUrl } from '@extension-base/background/handlers/helpers';
import AuthorizeStore from '@extension-base/stores/Authorize';
import { isEthereumAddress } from '@polkadot/util-crypto';
import { getId } from '@extension-base/utils';
import { isRequireEvmAPI } from '@extension-base/background/utils/utils';
import { type DAppChainInfoPayload } from '@extension-base/services/request-service/types';
import { type NetworkJson } from '@extension-base/types';
import type {
  Resolver,
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  RequestAuthorizeTab,
} from '@extension-base/background/types/types';
import type { NetworkService, RequestService } from '@extension-base/services';

const AUTH_URLS_KEY = 'authUrls';

export class AuthRequestHandler {
  private readonly requestService: RequestService;
  private readonly networkService: NetworkService;

  readonly authRequests: Record<string, AuthRequest> = {};
  private authorizeCached: AuthUrls = {};
  private readonly authorizeStore = new AuthorizeStore();
  private readonly authorizeUrlSubject = new BehaviorSubject<AuthUrls>({});
  public readonly authSubject = new BehaviorSubject<AuthorizeRequest[]>([]);

  constructor(requestService: RequestService, networkService: NetworkService) {
    this.getAuthorize((auths) => (this.authorizeCached = auths ?? {}));

    this.requestService = requestService;
    this.networkService = networkService;
  }

  public get numAuthRequests(): number {
    return Object.keys(this.authRequests).length;
  }

  private get authValues() {
    return Object.values(this.authRequests);
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
      callback && callback();
    });
  }

  public getAuthorize(update: (value: AuthUrls) => void): void {
    // This action can be use many by DApp interaction => caching it in memory
    if (Object.keys(this.authorizeCached).length) {
      update(this.authorizeCached);

      return;
    }

    this.authorizeStore.get('authUrls', (data) => {
      this.authorizeCached = data || {};

      this.authorizeUrlSubject.next(this.authorizeCached);
      update(this.authorizeCached);
    });
  }

  public getAuthList(): Promise<AuthUrls> {
    return new Promise<AuthUrls>((resolve) => {
      this.getAuthorize((rs: AuthUrls) => {
        resolve(rs ?? {});
      });
    });
  }

  public authComplete = (
    id: string,
    resolve: (resValue: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = [], isAllowed = true) => {
      const {
        id: idStr,
        request: { origin },
        accountAuthType,
        url,
      } = this.authRequests[id];

      if (!isAllowed) {
        delete this.authRequests[id];
        this.updateIconAuth(true);

        return;
      }

      const stripedUrl = stripUrl(url);

      this.authorizeCached[stripedUrl] = {
        authorizedAccounts,
        count: 0,
        isAllowed: true,
        accountAuthType,
        allowedAccountsMap: {},
        id: idStr,
        origin,
        url,
      };

      this.setAuthorize(this.authorizeCached);

      delete this.authRequests[id];

      this.updateIconAuth(true);
    };

    return {
      reject: (error: Error): void => {
        complete([], false);
        reject(error);
      },
      resolve: ({ authorizedAccounts }: AuthResponse): void => {
        complete(authorizedAccounts);
        resolve(true);
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
    const confirmAnotherType = existedAccountAuthType !== 'both' && existedAccountAuthType !== request.accountAuthType;

    // Reconfirm if check auth for empty list
    if (existedAuth) {
      if (request.reConfirm) request.origin = existedAuth.origin;

      const inBlackList = !existedAuth.isAllowed;

      if (inBlackList) throw new Error(`The source ${url} is not allowed to interact with this extension`);

      let allowedListByRequestType = [...existedAuth.authorizedAccounts];

      allowedListByRequestType = allowedListByRequestType.filter((a) => {
        if (accountAuthType === 'evm') return isEthereumAddress(a);
        if (accountAuthType === 'substrate') return !isEthereumAddress(a);

        return true;
      });

      // Prevent appear confirmation popup
      if (!confirmAnotherType && !request.reConfirm && allowedListByRequestType.length !== 0) return false;
    }

    return new Promise((resolve, reject): void => {
      const id = getId();

      this.authRequests[id] = {
        ...this.authComplete(id, resolve, reject),
        id,
        idStr,
        request,
        url,
        accountAuthType: existedAuth && existedAuth.accountAuthType !== accountAuthType ? 'both' : accountAuthType,
        currentEvmNetworkKey: existedAuth ? existedAuth.currentEvmNetworkKey : '0x1',
      };

      this.updateIconAuth();

      if (Object.keys(this.authRequests).length < 2) this.requestService.popupOpen();
    });
  }

  public getAuthRequest(id: string): AuthRequest {
    return this.authRequests[id];
  }

  public get subscribeAuthorizeUrlSubject() {
    return this.authorizeUrlSubject;
  }

  public ensureUrlAuthorized(url: string): Promise<boolean> {
    const idStr = stripUrl(url);

    return new Promise((resolve, reject) => {
      this.getAuthorize((authUrls) => {
        const entry = Object.keys(authUrls).includes(idStr);

        if (!entry) {
          reject(new Error(`The source ${url} has not been enabled yet`));
        }

        resolve(true);
      });
    });
  }

  getDAppNetworkInfo(options: DAppChainInfoPayload): NetworkJson | undefined {
    const networks = this.networkService.networkMap;
    const defaultChain = options.defaultChain;

    let chainInfo: NetworkJson | undefined;

    if (['both', 'evm'].includes(options.accessType)) {
      const evmChains = Object.values(networks).filter(({ name }) => isRequireEvmAPI(name));

      chainInfo =
        (defaultChain
          ? networks[defaultChain]
          : evmChains.find((chain) => networks[chain.name.toLowerCase()]?.active)) || evmChains[0];
    }

    return chainInfo;
  }
  public resetWallet() {
    for (const request of this.authValues) {
      request.reject(new Error('Reset wallet'));
    }

    this.authSubject.next([]);
    this.setAuthorize({});
  }
}
