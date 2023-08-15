import { BehaviorSubject } from 'rxjs';
import { assert } from '@polkadot/util';
import { stripUrl } from '../../../background/handlers/helpers';
import AuthorizeStore from '../../../stores/Authorize';
import { Resolver } from '../../../types';
import { KeyringService } from '../../keyring-service';

import State from '../../../background/handlers/State';
import { getId } from '../../../utils';
import { NetworkService, RequestService } from '../..';
import type {
  AuthRequest,
  AuthResponse,
  AuthUrls,
  AuthorizeRequest,
  RequestAuthorizeTab,
} from '../../../background/types';

const AUTH_URLS_KEY = 'authUrls';

export default class AuthRequestHandler {
  readonly requestService: RequestService;
  readonly state: State;
  readonly networkService: NetworkService;
  readonly authRequests: Record<string, AuthRequest> = {};
  private authorizeCached: AuthUrls | undefined = undefined;
  private readonly authorizeStore = new AuthorizeStore();
  private readonly authorizeUrlSubject = new BehaviorSubject<AuthUrls>({});
  private readonly evmChainSubject = new BehaviorSubject<AuthUrls>({});
  public readonly authSubject = new BehaviorSubject<AuthorizeRequest[]>([]);

  constructor(
    state: State,
    requestService: RequestService,
    networkService: NetworkService,
    private keyringService: KeyringService
  ) {
    this.state = state;
    this.requestService = requestService;
    this.networkService = networkService;
  }

  private getAddressList(value = false): Record<string, boolean> {
    const addressList = Object.keys(this.keyringService.accounts);

    return addressList.reduce((addressList, v) => ({ ...addressList, [v]: value }), {});
  }
  public get numAuthRequests(): number {
    return Object.keys(this.authRequests).length;
  }

  private get allAuthRequests(): AuthorizeRequest[] {
    return Object.values(this.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  private updateIconAuth(shouldClose?: boolean): void {
    this.authSubject.next(this.allAuthRequests);
    this.requestService.updateIcon(shouldClose);
  }

  public setAuthorize(data: AuthUrls, callback?: () => void): void {
    this.authorizeStore.set(AUTH_URLS_KEY, data, () => {
      this.authorizeCached = data;

      this.evmChainSubject.next(this.authorizeCached);
      this.authorizeUrlSubject.next(this.authorizeCached);
      callback && callback();
    });
  }

  public getAuthorize(update: (value: AuthUrls) => void): void {
    // This action can be use many by DApp interaction => caching it in memory
    if (this.authorizeCached) {
      update(this.authorizeCached);
    } else {
      this.authorizeStore.get('authUrls', (data) => {
        this.authorizeCached = data || {};
        this.evmChainSubject.next(this.authorizeCached);
        this.authorizeUrlSubject.next(this.authorizeCached);
        update(this.authorizeCached);
      });
    }
  }

  public getAuthList(): Promise<AuthUrls> {
    return new Promise<AuthUrls>((resolve) => {
      this.getAuthorize((rs: AuthUrls) => {
        resolve(rs);
      });
    });
  }

  public authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = [], isAllowed = true) => {
      const {
        id: idStr,
        request: { origin },
        url,
      } = this.authRequests[id];

      if (!isAllowed) {
        delete this.authRequests[id];
        this.updateIconAuth(true);

        return;
      }

      const stripedUrl = stripUrl(url);

      this.state.authUrls[stripedUrl] = {
        authorizedAccounts,
        count: 0,
        isAllowed: true,
        isAllowedMap: {},
        id: idStr,
        origin,
        url,
      };

      await this.state.saveCurrentAuthList();

      this.state.updateDefaultAuthAccounts(authorizedAccounts);

      delete this.authRequests[id];

      this.updateIconAuth(true);
    };

    return {
      reject: (error: Error): void => {
        complete([], false);
        reject(error);
      },
      resolve: ({ authorizedAccounts, result }: AuthResponse): void => {
        complete(authorizedAccounts);
        resolve({ authorizedAccounts, result });
      },
    };
  };

  public async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = Object.values(this.authRequests).some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    if (this.authRequests[idStr]) {
      // this url was seen in the past
      assert(
        this.state.authUrls[idStr].authorizedAccounts || this.state.authUrls[idStr].isAllowed,
        `The source ${url} is not allowed to interact with this extension`
      );

      return {
        authorizedAccounts: [],
        result: false,
      };
    }

    return new Promise((res, rej): void => {
      const id = getId();

      const { reject, resolve } = this.authComplete(id, res, rej);

      this.authRequests[id] = {
        reject,
        resolve,
        id,
        idStr,
        request,
        url,
      };

      this.updateIconAuth();
      this.requestService.popupOpen();
    });
  }

  public getAuthRequest(id: string): AuthRequest {
    return this.authRequests[id];
  }

  public get subscribeEvmChainChange() {
    return this.evmChainSubject;
  }

  public get subscribeAuthorizeUrlSubject() {
    return this.authorizeUrlSubject;
  }

  public ensureUrlAuthorized(url: string): Promise<boolean> {
    const idStr = stripUrl(url);

    return new Promise((resolve, reject) => {
      this.getAuthorize((value) => {
        if (!value) {
          value = {};
        }

        const entry = Object.keys(value).includes(idStr);

        if (!entry) {
          reject(new Error(`The source ${url} has not been enabled yet`));
        }

        resolve(true);
      });
    });
  }

  public resetWallet() {
    for (const request of Object.values(this.authRequests)) {
      request.reject(new Error('Reset wallet'));
    }

    this.authSubject.next([]);
    this.setAuthorize({});
  }
}
