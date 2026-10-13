import { BehaviorSubject } from 'rxjs';
import { assert } from '@polkadot/util';
import AuthorizeStore from '@extension-base/stores/Authorize';
import { getId } from '@extension-base/utils';
import { type DAppChainInfoPayload } from '@extension-base/services/request-service/types';
import { type NetworkJson } from '@extension-base/types';
import { AuthorizationWrites } from './authorizationWrites';
import type State from '@extension-base/background/handlers/State';
import type {
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
  private readonly signingAuthorizationState = {
    substrate: { revisions: new Map<string, number>(), fingerprints: new Map<string, string>() },
    solana: { revisions: new Map<string, number>(), fingerprints: new Map<string, string>() },
  };
  private authorizeLoaded = false;
  private authorizeLoading?: Promise<void>;
  private authorizeWrites?: AuthorizationWrites;
  private readonly authorizeStore = new AuthorizeStore();
  private readonly evmChainSubject = new BehaviorSubject<AuthUrls>({});
  private readonly authorizeUrlSubject = new BehaviorSubject<AuthUrls>({});
  public readonly authSubject = new BehaviorSubject<AuthorizeRequest[]>([]);

  constructor(requestService: RequestService, state: State) {
    this.requestService = requestService;
    this.networkService = state.networkService;
    this.keyringService = state.keyringService;
  }

  public get numAuthRequests(): number {
    return Object.keys(this.authRequests).length;
  }

  private assertWalletAvailable(resetRevision = this.keyringService.walletResetRevision): void {
    if (this.keyringService.isResetting || this.keyringService.walletResetRevision !== resetRevision)
      throw new Error('Wallet changed during authorization');
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

  private initializeAuthorizations(data: AuthUrls): void {
    this.authorizeCached = structuredClone(data);
    this.trackEvmAuthorization(this.authorizeCached, true);
    this.trackSigningAuthorization(this.authorizeCached, true);
    this.authorizeWrites = new AuthorizationWrites(
      data,
      (entries) => this.authorizeStore.setAndWait(AUTH_URLS_KEY, entries),
      (entries) => {
        this.trackEvmAuthorization(entries);
        this.trackSigningAuthorization(entries);
        this.authorizeCached = entries;
        this.authorizeUrlSubject.next(structuredClone(entries));
      }
    );
    this.authorizeLoaded = true;
    if (Object.keys(this.authorizeCached).length)
      this.authorizeUrlSubject.next(structuredClone(this.authorizeCached));
  }

  public setAuthorize(data: AuthUrls, callback?: () => void): Promise<void> {
    // Explicit replacement (including reset) supersedes an outstanding startup
    // read. Its new grants still remain unavailable until the write commits.
    if (!this.authorizeWrites) this.initializeAuthorizations({});
    return this.authorizeWrites!.replace(structuredClone(data), true).then(() => { callback?.(); });
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
    this.assertWalletAvailable();
    if (!this.authorizeLoaded) throw new Error('Site authorization is not loaded');
    const origin = stripUrl(url);
    return {
      revision: this.evmAuthorizationRevisions.get(origin) ?? 0,
      authorization: structuredClone(this.authorizeCached[origin]),
    };
  }

  private trackSigningAuthorization(data: AuthUrls, initial = false): void {
    for (const protocol of ['substrate', 'solana'] as const) {
      const state = this.signingAuthorizationState[protocol];
      for (const origin of new Set([...state.fingerprints.keys(), ...Object.keys(data)])) {
        const auth = data[origin];
        const accounts = protocol === 'substrate'
          ? Array.isArray(auth?.authorizedAccounts) ? [...new Set(auth.authorizedAccounts)].sort() : undefined
          : auth?.solanaAuthorizedAccount;
        const fingerprint = auth ? JSON.stringify([auth.id, auth.isAllowed, accounts]) : undefined;
        if (!initial && fingerprint !== state.fingerprints.get(origin))
          state.revisions.set(origin, (state.revisions.get(origin) ?? 0) + 1);
        if (fingerprint === undefined) state.fingerprints.delete(origin);
        else state.fingerprints.set(origin, fingerprint);
      }
    }
  }

  public getSigningAuthorizationSnapshot(
    url: string,
    protocol: 'substrate' | 'solana'
  ): { revision: number; authorization?: AuthUrlInfo } {
    this.assertWalletAvailable();
    if (!this.authorizeLoaded) throw new Error('Site authorization is not loaded');
    const origin = stripUrl(url);
    return {
      revision: this.signingAuthorizationState[protocol].revisions.get(origin) ?? 0,
      authorization: structuredClone(this.authorizeCached[origin]),
    };
  }

  public getSigningAuthorizationRevision(url: string, protocol: 'substrate' | 'solana', address: string): number {
    const { authorization: entry, revision } = this.getSigningAuthorizationSnapshot(url, protocol);
    if (!entry || entry.isAllowed !== true) throw new Error(`The source ${url} has not been enabled`);
    let authorized: boolean;
    if (protocol === 'solana') authorized = !!address && entry.solanaAuthorizedAccount === address;
    else {
      let requestedAddress: string;
      try {
        requestedAddress = this.keyringService.encodeAddress(address);
      } catch {
        throw new Error('The requested signing account is invalid');
      }
      authorized = Array.isArray(entry.authorizedAccounts) && entry.authorizedAccounts.some((candidate) => {
        try {
          return this.keyringService.encodeAddress(candidate) === requestedAddress;
        } catch {
          return false;
        }
      });
    }
    if (!authorized) throw new Error(`The source ${url} is not authorized for the requested signing account`);
    return revision;
  }

  public assertSigningAuthorization(
    url: string,
    protocol: 'substrate' | 'solana',
    address: string,
    revision: number | undefined
  ): void {
    if (!Number.isSafeInteger(revision) || revision !== this.getSigningAuthorizationRevision(url, protocol, address))
      throw new Error('Signing authorization changed; request approval again');
  }

  public async getAuthorize(update: (value: AuthUrls) => void): Promise<void> {
    update(await this.getAuthList());
  }

  public async getAuthList(): Promise<AuthUrls> {
    if (!this.authorizeLoaded) {
      if (!this.authorizeLoading) {
        this.authorizeLoading = this.authorizeStore.getAndWait(AUTH_URLS_KEY).then((data) => {
          if (!this.authorizeLoaded) this.initializeAuthorizations(data ?? {});
        }).finally(() => { this.authorizeLoading = undefined; });
      }
      await this.authorizeLoading;
    }
    return structuredClone(this.authorizeCached);
  }

  public async mutateAuthorizations(update: (entries: AuthUrls) => void): Promise<AuthUrls> {
    const resetRevision = this.keyringService.walletResetRevision;
    this.assertWalletAvailable(resetRevision);
    await this.getAuthList();
    await this.authorizeWrites!.mutate((entries) => { this.assertWalletAvailable(resetRevision); update(entries); });
    return structuredClone(this.authorizeCached);
  }

  public authComplete = (
    id: string,
    existedAuth: AuthUrlInfo,
    resolve: (resValue: boolean) => void,
    reject: (error: Error) => void
  ): Pick<AuthRequest, 'resolve' | 'reject'> => {
    let expected = existedAuth ? { id: existedAuth.id, isAllowed: existedAuth.isAllowed } : undefined;
    let approving = false;
    const discard = (error?: Error) => {
      delete this.authRequests[id];
      this.updateIconAuth(true);
      if (error) reject(error);
    };
    return {
      resolve: async ({ authorizedAccounts }: AuthResponse): Promise<void> => {
        this.assertWalletAvailable();
        if (approving) throw new Error('Site authorization is already being saved');
        const request = this.authRequests[id];
        if (!request) throw new Error('Unable to find authorization request');
        const originKey = stripUrl(request.url);
        const current = this.authorizeCached[originKey];
        if (expected
          ? !current || current.id !== expected.id || current.isAllowed !== expected.isAllowed
          : current !== undefined) {
          const error = new Error('Site authorization changed; request approval again');
          discard(error);
          throw error;
        }
        const version = this.authorizeWrites!.version(originKey);
        approving = true;
        try {
          const substrateAccount = this.keyringService.getAccount(authorizedAccounts[0]);
          const ethereumAddress = substrateAccount?.meta.ethereumAddress as string;
          const requestType = request.request.accountAuthType ?? request.accountAuthType;
          const preserved = current?.isAllowed ? current : undefined;
          // Build from the effective grant, never from uncommitted new scopes.
          await this.authorizeWrites!.mutate((entries) => {
            entries[originKey] = {
              authorizedAccounts: requestType === 'substrate' ? authorizedAccounts : preserved?.authorizedAccounts ?? [],
              evmAuthorizedAccount: requestType === 'evm' ? ethereumAddress : preserved?.evmAuthorizedAccount ?? '',
              solanaAuthorizedAccount: requestType === 'solana' ? authorizedAccounts[0] ?? '' : preserved?.solanaAuthorizedAccount ?? '',
              irohaAuthorizedAccount: requestType === 'iroha' ? authorizedAccounts[0] ?? '' : preserved?.irohaAuthorizedAccount ?? '',
              count: 0,
              isAllowed: true,
              accountAuthType: mergeAuthType(preserved?.accountAuthType, requestType!),
              allowedAccountsMap: {},
              id: request.id,
              origin: request.request.origin,
              url: request.url,
              currentEvmNetworkKey: current?.currentEvmNetworkKey ?? request.currentEvmNetworkKey,
            };
          });
          if (this.authRequests[id] !== request || this.authorizeWrites!.version(originKey) !== version + 1)
            throw new Error('Site authorization changed while saving; request approval again');
          discard();
          resolve(true);
        } catch (cause) {
          const error = cause instanceof Error ? cause : new Error('Unable to save site authorization');
          if (this.authRequests[id] === request) {
            if (this.authorizeWrites!.version(originKey) === version + 1) {
              // A failed physical write keeps the popup and dapp pending for an
              // explicit retry. Accept only our own resulting fail-closed state.
              const latest = this.authorizeCached[originKey];
              expected = latest ? { id: latest.id, isAllowed: latest.isAllowed } : undefined;
            } else discard(error);
          }
          throw error;
        } finally {
          approving = false;
        }
      },
      reject: (error: Error): void => {
        const request = this.authRequests[id];
        if (approving && request) {
          // Cancellation cannot retract an in-flight physical write. Queue its
          // revocation and veto it synchronously before removing the request.
          void this.authorizeWrites!.mutate((entries) => { delete entries[stripUrl(request.url)]; })
            .catch(() => console.error('Unable to persist cancelled site authorization'));
        }
        discard(error);
      },
    };
  };

  public async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<boolean> {
    const resetRevision = this.keyringService.walletResetRevision;
    this.assertWalletAvailable(resetRevision);
    await this.getAuthList();
    this.assertWalletAvailable(resetRevision);
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
    await this.getAuthList();
    const entry = this.authorizeCached[idStr];

    if (!entry || entry.isAllowed !== true) {
      throw new Error(`The source ${url} has not been enabled`);
    }

    return true;
  }

  public async ensureAccountAuthorized(url: string, address: string): Promise<boolean> {
    await this.getAuthList();
    this.getSigningAuthorizationRevision(url, 'substrate', address);
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
    return this.setAuthorize({});
  }
}
