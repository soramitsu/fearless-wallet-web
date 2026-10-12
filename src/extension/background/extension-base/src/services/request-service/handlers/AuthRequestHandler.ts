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

const isAuthTypeCovered = (existing: RequestAuthorizeTab['accountAuthType'], requested: RequestAuthorizeTab['accountAuthType']) => {
  if (!existing || !requested) return false;
  if (existing === 'all' || existing === requested) return true;
  if (existing === 'both') return requested === 'substrate' || requested === 'evm';

  return false;
};

const mergeAuthType = (
  existing: RequestAuthorizeTab['accountAuthType'] | undefined,
  requested: RequestAuthorizeTab['accountAuthType']
): RequestAuthorizeTab['accountAuthType'] => {
  if (!existing || existing === requested) return requested;
  if (existing === 'all' || requested === 'all') return 'all';
  if (existing === 'both' && (requested === 'substrate' || requested === 'evm')) return 'both';
  if (requested === 'both' && (existing === 'substrate' || existing === 'evm')) return 'both';
  if (
    (existing === 'substrate' || existing === 'evm') &&
    (requested === 'substrate' || requested === 'evm')
  ) {
    return 'both';
  }

  return 'all';
};

export class AuthRequestHandler {
  private readonly requestService: RequestService;
  private readonly networkService: NetworkService;
  private readonly keyringService: KeyringService;

  readonly authRequests: Record<string, AuthRequest> = {};
  private authorizeCached: AuthUrls = {};
  private readonly evmAuthorizationRevisions = new Map<string, number>();
  private readonly evmAuthorizationFingerprints = new Map<string, string>();
  private authorizeLoaded = false;
  private authorizeLoading = false;
  private authorizeWaiters: Array<(value: AuthUrls) => void> = [];
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
    // The underlying stores already serialize writes. Copy their input now so
    // later in-place edits cannot rewrite a queued grant or revocation.
    const snapshot = structuredClone(data);
    this.trackEvmAuthorization(snapshot);
    this.authorizeCached = snapshot;
    this.authorizeLoaded = true;
    this.authorizeStore.set(AUTH_URLS_KEY, structuredClone(snapshot), () => {
      // A newer intent may already be cached while this older write completes.
      // Its callback must never restore the older permissions.
      this.authorizeUrlSubject.next(structuredClone(this.authorizeCached));
      callback?.();
    });
    // A waiter may publish a newer authorization intent. Enqueue this write
    // first so the store's serialized order remains the same as the cache's.
    this.flushAuthorizeWaiters();
  }

  private trackEvmAuthorization(data: AuthUrls, initial = false): void {
    const origins = new Set([...this.evmAuthorizationFingerprints.keys(), ...Object.keys(data)]);
    for (const origin of origins) {
      const auth = data[origin];
      const fingerprint = auth
        ? JSON.stringify([
            auth.id,
            auth.isAllowed,
            auth.evmAuthorizedAccount?.toLowerCase(),
            auth.currentEvmNetworkKey?.toLowerCase(),
          ])
        : undefined;
      if (!initial && fingerprint !== this.evmAuthorizationFingerprints.get(origin))
        this.evmAuthorizationRevisions.set(origin, (this.evmAuthorizationRevisions.get(origin) ?? 0) + 1);
      if (fingerprint === undefined) this.evmAuthorizationFingerprints.delete(origin);
      else this.evmAuthorizationFingerprints.set(origin, fingerprint);
    }
  }

  // Admission waits for loading once. Final signing checks read this snapshot
  // synchronously, so no storage await separates authorization from submission.
  public getEvmAuthorizationSnapshot(url: string): { revision: number; authorization?: AuthUrlInfo } {
    if (!this.authorizeLoaded) throw new Error('Site authorization is not loaded');
    const origin = stripUrl(url);
    return {
      revision: this.evmAuthorizationRevisions.get(origin) ?? 0,
      authorization: structuredClone(this.authorizeCached[origin]),
    };
  }

  public getAuthorize(update: (value: AuthUrls) => void): void {
    if (this.authorizeLoaded) {
      update(structuredClone(this.authorizeCached));

      return;
    }

    this.authorizeWaiters.push(update);
    if (this.authorizeLoading) return;

    this.authorizeLoading = true;
    this.authorizeStore.get(AUTH_URLS_KEY, (data) => {
      this.authorizeLoading = false;
      if (!this.authorizeLoaded) {
        this.authorizeCached = structuredClone(data || {});
        this.trackEvmAuthorization(this.authorizeCached, true);
        this.authorizeLoaded = true;
        this.authorizeUrlSubject.next(structuredClone(this.authorizeCached));
      }

      this.flushAuthorizeWaiters();
    });
  }

  private flushAuthorizeWaiters(): void {
    const waiters = this.authorizeWaiters.splice(0);

    waiters.forEach((update) => update(structuredClone(this.authorizeCached)));
  }

  public getAuthList(): Promise<AuthUrls> {
    return new Promise<AuthUrls>((resolve) => this.getAuthorize((rs: AuthUrls) => resolve(rs ?? {})));
  }

  public async mutateAuthorizations(update: (entries: AuthUrls) => void): Promise<AuthUrls> {
    await this.getAuthList();
    // Read after the load barrier, then transform and publish without yielding.
    // Callers must not write a whole map captured before an asynchronous step.
    const next = structuredClone(this.authorizeCached);
    update(next);
    this.setAuthorize(next);
    return structuredClone(this.authorizeCached);
  }

  public authComplete = (
    id: string,
    existedAuth: AuthUrlInfo,
    resolve: (resValue: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const expected = existedAuth ? { id: existedAuth.id, isAllowed: existedAuth.isAllowed } : undefined;
    const complete = (_authorizedAccounts: string[] = [], isAllowed = true) => {
      const {
        id: idStr,
        request: { accountAuthType: requestedAccountAuthType, origin },
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
      const current = this.authorizeCached[stripedUrl];
      if (
        expected
          ? !current || current.id !== expected.id || current.isAllowed !== expected.isAllowed
          : current !== undefined
      ) {
        throw new Error('Site authorization changed; request approval again');
      }

      const substrateAccount = this.keyringService.getAccount(_authorizedAccounts[0]);
      const ethereumAddress = substrateAccount?.meta.ethereumAddress as string;
      const requestType = requestedAccountAuthType ?? accountAuthType;
      // Explicit reauthorization of one protocol must not revive other scopes
      // retained in a globally denied record.
      const preserved = current?.isAllowed ? current : undefined;

      const evmAuthorizedAccount =
        requestType === 'evm' ? ethereumAddress : preserved?.evmAuthorizedAccount ?? '';

      const authorizedAccounts =
        requestType === 'substrate' ? _authorizedAccounts : preserved?.authorizedAccounts ?? [];

      const solanaAuthorizedAccount =
        requestType === 'solana' ? _authorizedAccounts[0] ?? '' : preserved?.solanaAuthorizedAccount ?? '';
      const irohaAuthorizedAccount =
        requestType === 'iroha' ? _authorizedAccounts[0] ?? '' : preserved?.irohaAuthorizedAccount ?? '';

      this.authorizeCached[stripedUrl] = {
        authorizedAccounts,
        evmAuthorizedAccount,
        solanaAuthorizedAccount,
        irohaAuthorizedAccount,
        count: 0,
        isAllowed: true,
        accountAuthType: mergeAuthType(preserved?.accountAuthType, requestType),
        allowedAccountsMap: {},
        id: idStr,
        origin,
        url,
        currentEvmNetworkKey: current?.currentEvmNetworkKey ?? currentEvmNetworkKey,
      };

      this.setAuthorize(this.authorizeCached);

      delete this.authRequests[id];

      this.updateIconAuth(true);
    };

    return {
      resolve: ({ authorizedAccounts }: AuthResponse): void => {
        try {
          complete(authorizedAccounts);
          resolve(true);
        } catch (error) {
          complete([], false);
          reject(error instanceof Error ? error : new Error('Unable to authorize site'));
        }
      },
      reject: (error: Error): void => {
        complete([], false);
        reject(error);
      },
    };
  };

  public async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<boolean> {
    await this.getAuthList();
    const authList = this.authorizeCached;

    const accountAuthType = request.accountAuthType ?? 'substrate';

    request.accountAuthType = accountAuthType;

    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = this.authValues.some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    const existedAuth = authList[idStr];
    const existedAccountAuthType = existedAuth?.accountAuthType;
    const isNewType = !isAuthTypeCovered(existedAccountAuthType, request.accountAuthType);

    if (request.accountAuthType === 'evm') {
      if (existedAuth && existedAuth?.evmAuthorizedAccount !== '' && !request.reConfirm) return false;
    } else if (request.accountAuthType === 'solana') {
      if (existedAuth && existedAuth?.solanaAuthorizedAccount && !request.reConfirm) return false;
    } else if (request.accountAuthType === 'iroha') {
      const authorizedAccount = existedAuth?.irohaAuthorizedAccount;
      const allowedAccounts = request.allowedAccounts ?? [];
      const authorizedAccountMatchesRequest = allowedAccounts.length === 0 || allowedAccounts.includes(authorizedAccount ?? '');

      if (existedAuth && authorizedAccount && authorizedAccountMatchesRequest && !request.reConfirm) return false;
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
        accountAuthType: mergeAuthType(existedAuth?.accountAuthType, accountAuthType),
        currentEvmNetworkKey: existedAuth ? existedAuth.currentEvmNetworkKey : 'Ethereum',
      };

      this.updateIconAuth();

      if (Object.keys(this.authRequests).length < 2) this.requestService.popupOpen();
    });
  }

  public getAuthRequest(id: string): AuthRequest {
    return this.authRequests[id];
  }

  public async ensureUrlAuthorized(url: string): Promise<boolean> {
    const idStr = stripUrl(url);
    const authUrls = await this.getAuthList();
    const entry = authUrls[idStr];

    if (!entry || entry.isAllowed !== true) {
      throw new Error(`The source ${url} has not been enabled`);
    }

    return true;
  }

  public async ensureAccountAuthorized(url: string, address: string): Promise<boolean> {
    await this.ensureUrlAuthorized(url);
    const authUrls = await this.getAuthList();
    const entry = authUrls[stripUrl(url)];
    let requestedAddress: string;

    try {
      requestedAddress = this.keyringService.encodeAddress(address);
    } catch {
      throw new Error('The requested signing account is invalid');
    }

    const authorized = Array.isArray(entry.authorizedAccounts) && entry.authorizedAccounts.some((candidate) => {
      try {
        return this.keyringService.encodeAddress(candidate) === requestedAddress;
      } catch {
        return false;
      }
    });

    if (!authorized) throw new Error(`The source ${url} is not authorized for the requested signing account`);

    return true;
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
