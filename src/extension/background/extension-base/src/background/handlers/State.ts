// Copyright 2019-2022 @polkadot/extension-bg authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BehaviorSubject, Subscription } from 'rxjs';

import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert } from '@polkadot/util';

import { MetadataStore } from '../../stores';
import {
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  MetadataRequest,
  MetaRequest,
  NORMAL_WINDOW_OPTS,
  POPUP_WINDOW_OPTS,
  Providers,
  ResponseSigning,
  SigningRequest,
  SignRequest,
  Resolver,
  AuthorizedAccountsDiff,
  AccountJson,
  RequestAuthorizeTab,
  RequestRpcSend,
  RequestRpcSubscribe,
  RequestRpcUnsubscribe,
  RequestSign,
  ResponseRpcListProviders,
} from '../types';
import { getId } from '../../utils/getId';
import { withErrorLog } from './helpers';
import type { JsonRpcResponse, ProviderInterface, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';

const AUTH_URLS_KEY = 'authUrls';
const DEFAULT_AUTH_ACCOUNTS = 'defaultAuthAccounts';

type CachedUnlocks = Record<string, number>;
interface AccountSub {
  subscription: Subscription;
  url: string;
}

interface IState {
  authRequests: Record<string, AuthRequest>;
  metaRequests: Record<string, MetaRequest>;
  signRequests: Record<string, SignRequest>;
  authUrls: AuthUrls;
  metaStore: MetadataStore;
  injectedProviders: Map<chrome.runtime.Port, ProviderInterface>;
  notification: string;
  authSubject: BehaviorSubject<AuthorizeRequest[]>;
  metaSubject: BehaviorSubject<MetadataRequest[]>;
  signSubject: BehaviorSubject<SigningRequest[]>;
  providers: Providers;
  accountSubs: Record<string, AccountSub>;
  windows: number[];
  cachedUnlocks: CachedUnlocks;
  connectedTabsUrl: string[];
  defaultAuthAccountSelection: string[];
}

function extractMetadata(store: MetadataStore): void {
  store.allMap((map): void => {
    const knownEntries = Object.entries(knownGenesis);
    const defs: Record<string, { def: MetadataDef; index: number; key: string }> = {};
    const removals: string[] = [];

    Object.entries(map).forEach(([key, def]): void => {
      const entry = knownEntries.find(([, hashes]) => hashes.includes(def.genesisHash));

      if (entry) {
        const [name, hashes] = entry;
        const index = hashes.indexOf(def.genesisHash);

        // flatten the known metadata based on the genesis index
        // (lower is better/newer)
        if (!defs[name] || defs[name].index > index) {
          if (defs[name]) {
            // remove the old version of the metadata
            removals.push(defs[name].key);
          }

          defs[name] = { def, index, key };
        }
      } else {
        // this is not a known entry, so we will just apply it
        defs[key] = { def, index: 0, key };
      }
    });

    removals.forEach((key) => store.remove(key));
    Object.values(defs).forEach(({ def }) => addMetadata(def));
  });
}

export function initState(providers: Providers = {}) {
  const metaStore = new MetadataStore();
  extractMetadata(metaStore);

  const authString = localStorage.getItem(AUTH_URLS_KEY) || '{}';
  const previousAuth = JSON.parse(authString) as AuthUrls;

  const defaultAuthString = localStorage.getItem(DEFAULT_AUTH_ACCOUNTS) || '[]';
  const previousDefaultAuth = JSON.parse(defaultAuthString) as string[];

  chrome.storage.local.set({
    authUrls: previousAuth,
    authRequests: {},
    signRequests: {},
    metaRequests: {},
    accountSubs: {},
    metaStore,
    providers,
    connectedTabsUrl: [],
    defaultAuthAccountSelection: previousDefaultAuth,
  });
}

export default class State {
  static get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  static async getFromStorage(key: (keyof IState)[]): Promise<Pick<IState, typeof key[number]>> {
    const values = (await chrome.storage.local.get(key).then((value) => value)) as any as Pick<
      IState,
      typeof key[number]
    >;

    return values;
  }

  static async numAuthRequests() {
    const { authRequests } = await State.getFromStorage(['authRequests']);

    return Object.keys(authRequests).length;
  }

  static async numMetaRequests() {
    const { metaRequests } = await State.getFromStorage(['metaRequests']);

    return Object.keys(metaRequests).length;
  }

  static async numSignRequests() {
    const { signRequests } = await State.getFromStorage(['signRequests']);

    return Object.keys(signRequests).length;
  }

  static async allAuthRequests(): Promise<AuthorizeRequest[]> {
    const { authRequests } = await State.getFromStorage(['authRequests']);

    return Object.values(authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  static async allMetaRequests(): Promise<MetadataRequest[]> {
    const { metaRequests } = await State.getFromStorage(['metaRequests']);

    return Object.values(metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  static async allSignRequests(): Promise<SigningRequest[]> {
    const { signRequests } = await State.getFromStorage(['signRequests']);

    return Object.values(signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  public async authUrls(): Promise<AuthUrls> {
    const { authUrls } = await State.getFromStorage(['authUrls']);

    return authUrls;
  }

  static async popupClose(): Promise<void> {
    const { windows } = await State.getFromStorage(['windows']);

    windows?.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));

    chrome.storage.local.set({ windows: [] });
  }

  static async popupOpen(): Promise<void> {
    const { notification, windows } = await State.getFromStorage(['notification', 'windows']);
    if (notification && notification !== 'extension')
      chrome.windows.create(
        notification === 'window' ? NORMAL_WINDOW_OPTS : POPUP_WINDOW_OPTS,
        async (window): Promise<void> => {
          if (window) {
            windows?.push(window.id || 0);
            await chrome.storage.local.set({ windows });
          }
        }
      );
  }

  static authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = []) => {
      const { authRequests, authUrls } = await State.getFromStorage(['authRequests', 'authUrls']);

      const {
        id: idStr,
        request: { origin },
        url,
      } = authRequests[id];

      authUrls[State.stripUrl(url)] = {
        authorizedAccounts,
        count: 0,
        id: idStr,
        origin,
        url,
      };

      State.saveCurrentAuthList();
      State.updateDefaultAuthAccounts(authorizedAccounts);

      delete authRequests[id];
      chrome.storage.local.set({ authRequests });
      State.updateIconAuth(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: ({ authorizedAccounts, result }: AuthResponse): void => {
        complete(authorizedAccounts);
        resolve({ authorizedAccounts, result });
      },
    };
  };

  static async updateCurrentTabsUrl(urls: string[]) {
    const { authUrls } = await State.getFromStorage(['authUrls']);

    const connectedTabs = urls
      .map((url) => {
        let strippedUrl = '';

        // the assert in stripUrl may throw for new tabs with "chrome://newtab/"
        try {
          strippedUrl = State.stripUrl(url);
        } catch (e) {
          console.error(e);
        }

        // return the stripped url only if this website is known
        return !!strippedUrl && authUrls[strippedUrl] ? strippedUrl : undefined;
      })
      .filter((value) => !!value) as unknown as string[];

    chrome.storage.local.set({ connectedTabsUrl: connectedTabs });
  }

  static async getConnectedTabsUrl() {
    const { connectedTabsUrl } = await State.getFromStorage(['connectedTabsUrl']);

    return connectedTabsUrl;
  }

  static async deleteAuthRequest(requestId: string) {
    const { authRequests } = await State.getFromStorage(['authRequests']);

    delete authRequests[requestId];

    chrome.storage.local.set({ authRequests });
    State.updateIconAuth(true);
  }

  static async saveCurrentAuthList() {
    const { authUrls } = await State.getFromStorage(['authUrls']);

    localStorage.setItem(AUTH_URLS_KEY, JSON.stringify(authUrls));
  }

  static async saveDefaultAuthAccounts() {
    const { defaultAuthAccountSelection } = await State.getFromStorage(['defaultAuthAccountSelection']);

    localStorage.setItem(DEFAULT_AUTH_ACCOUNTS, JSON.stringify(defaultAuthAccountSelection));
  }

  static async updateDefaultAuthAccounts(newList: string[]) {
    chrome.storage.local.set({ defaultAuthAccountSelection: newList });

    State.saveDefaultAuthAccounts();
  }

  static metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = async (): Promise<void> => {
      const { metaRequests } = await State.getFromStorage(['metaRequests']);

      delete metaRequests[id];

      chrome.storage.local.set({ metaRequests });
      State.updateIconMeta(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: boolean): void => {
        complete();
        resolve(result);
      },
    };
  };

  static signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = async (): Promise<void> => {
      const { signRequests } = await State.getFromStorage(['signRequests']);

      delete signRequests[id];

      chrome.storage.local.set({ signRequests });

      State.updateIconSign(true);
    };

    return {
      reject: (error: Error): void => {
        complete();
        reject(error);
      },
      resolve: (result: ResponseSigning): void => {
        complete();
        resolve(result);
      },
    };
  };

  static stripUrl(url: string): string {
    assert(
      url &&
        (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('ipfs:') || url.startsWith('ipns:')),
      `Invalid url ${url}, expected to start with http: or https: or ipfs: or ipns:`
    );

    const parts = url.split('/');

    return parts[2];
  }

  static async updateIcon(shouldClose?: boolean): Promise<void> {
    const authCount = await State.numAuthRequests();
    const metaCount = await State.numMetaRequests();
    const signCount = await State.numSignRequests();
    const text = authCount ? 'Auth' : metaCount ? 'Meta' : signCount ? `${signCount}` : '';

    withErrorLog(() => chrome.action.setBadgeText({ text }));

    if (shouldClose && text === '') {
      this.popupClose();
    }
  }

  static async removeAuthorization(url: string): Promise<AuthUrls> {
    const { authUrls } = await State.getFromStorage(['authUrls']);
    const entry = authUrls[url];

    assert(entry, `The source ${url} is not known`);

    delete authUrls[url];
    chrome.storage.local.set({ authUrls });
    State.saveCurrentAuthList();

    return authUrls;
  }

  static async updateIconAuth(shouldClose?: boolean): Promise<void> {
    const { authSubject } = await State.getFromStorage(['authSubject']);
    const allAuthRequests = await State.allAuthRequests();

    authSubject.next(allAuthRequests);
    State.updateIcon(shouldClose);
  }

  static async updateIconMeta(shouldClose?: boolean): Promise<void> {
    const { metaSubject } = await State.getFromStorage(['metaSubject']);
    const allMetaRequests = await State.allMetaRequests();

    metaSubject.next(allMetaRequests);
    State.updateIcon(shouldClose);
  }

  static async updateIconSign(shouldClose?: boolean): Promise<void> {
    const { signSubject } = await State.getFromStorage(['signSubject']);
    const allSignRequests = await State.allSignRequests();

    signSubject.next(allSignRequests);
    State.updateIcon(shouldClose);
  }

  static async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    const { authUrls } = await State.getFromStorage(['authUrls']);

    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      authUrls[url].authorizedAccounts = authorizedAccountDiff;
    });

    State.saveCurrentAuthList();
  }

  static async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    const idStr = State.stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const { authRequests, authUrls } = await State.getFromStorage(['authRequests', 'authUrls']);
    const isDuplicate = Object.values(authRequests).some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    if (authUrls[idStr]) {
      // this url was seen in the past
      assert(
        authUrls[idStr].authorizedAccounts || authUrls[idStr].isAllowed,
        `The source ${url} is not allowed to interact with this extension`
      );

      return {
        authorizedAccounts: [],
        result: false,
      };
    }

    return new Promise((resolve, reject): void => {
      const id = getId();

      authRequests[id] = {
        ...State.authComplete(id, resolve, reject),
        id,
        idStr,
        request,
        url,
      };

      State.updateIconAuth();
      State.popupOpen();
    });
  }

  static async ensureUrlAuthorized(url: string): Promise<boolean> {
    const { authUrls } = await State.getFromStorage(['authUrls']);

    const entry = authUrls[State.stripUrl(url)];

    assert(entry, `The source ${url} has not been enabled yet`);

    return true;
  }

  static async injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    const { metaRequests } = await State.getFromStorage(['metaRequests']);

    return new Promise((resolve, reject): void => {
      const id = getId();
      metaRequests[id] = {
        ...State.metaComplete(id, resolve, reject),
        id,
        request,
        url,
      };

      State.updateIconMeta();
      State.popupOpen();
    });
  }

  static async getAuthRequest(id: string): Promise<AuthRequest> {
    const { authRequests } = await State.getFromStorage(['authRequests']);

    return authRequests[id];
  }

  static async getMetaRequest(id: string): Promise<MetaRequest> {
    const { metaRequests } = await State.getFromStorage(['metaRequests']);

    return metaRequests[id];
  }

  static async getSignRequest(id: string): Promise<SignRequest> {
    const { signRequests } = await State.getFromStorage(['signRequests']);

    return signRequests[id];
  }

  // List all providers the extension is exposing
  static async rpcListProviders(): Promise<ResponseRpcListProviders> {
    const { providers } = await State.getFromStorage(['providers']);

    return Promise.resolve(
      Object.keys(providers).reduce((acc, key) => {
        acc[key] = providers[key].meta;

        return acc;
      }, {} as ResponseRpcListProviders)
    );
  }

  static async rpcSend(request: RequestRpcSend, port: chrome.runtime.Port): Promise<JsonRpcResponse> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.send(request.method, request.params);
  }

  // Start a provider, return its meta
  static async rpcStartProvider(key: string, port: chrome.runtime.Port): Promise<ProviderMeta> {
    const { providers, injectedProviders } = await State.getFromStorage(['providers', 'injectedProviders']);

    assert(Object.keys(providers).includes(key), `Provider ${key} is not exposed by extension`);

    if (injectedProviders.get(port)) {
      return Promise.resolve(providers[key].meta);
    }

    // Instantiate the provider
    injectedProviders.set(port, providers[key].start());

    // Close provider connection when page is closed
    port.onDisconnect.addListener((): void => {
      const provider = injectedProviders.get(port);

      if (provider) {
        withErrorLog(() => provider.disconnect());
      }

      injectedProviders.delete(port);
    });

    return Promise.resolve(providers[key].meta);
  }

  static async rpcSubscribe(
    { method, params, type }: RequestRpcSubscribe,
    cb: ProviderInterfaceCallback,
    port: chrome.runtime.Port
  ): Promise<number | string> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribe) before provider is set');

    return provider.subscribe(type, method, params, cb);
  }

  static async rpcSubscribeConnected(
    _request: null,
    cb: ProviderInterfaceCallback,
    port: chrome.runtime.Port
  ): Promise<void> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.subscribeConnected) before provider is set');

    cb(null, provider.isConnected); // Immediately send back current isConnected
    provider.on('connected', () => cb(null, true));
    provider.on('disconnected', () => cb(null, false));
  }

  static async rpcUnsubscribe(request: RequestRpcUnsubscribe, port: chrome.runtime.Port): Promise<boolean> {
    const { injectedProviders } = await State.getFromStorage(['injectedProviders']);

    const provider = injectedProviders.get(port);

    assert(provider, 'Cannot call pub(rpc.unsubscribe) before provider is set');

    return provider.unsubscribe(request.type, request.method, request.subscriptionId);
  }

  static async saveMetadata(meta: MetadataDef): Promise<void> {
    const { metaStore } = await State.getFromStorage(['metaStore']);

    metaStore.set(meta.genesisHash, meta);

    addMetadata(meta);
  }

  static async setNotification(notification: string): Promise<boolean> {
    chrome.storage.local.set({ notification });

    return true;
  }

  static async sign(url: string, request: RequestSign, account: AccountJson): Promise<ResponseSigning> {
    const id = getId();
    const { signRequests } = await State.getFromStorage(['signRequests']);

    return new Promise((resolve, reject): void => {
      signRequests[id] = {
        ...State.signComplete(id, resolve, reject),
        account,
        id,
        request,
        url,
      };

      State.updateIconSign();
      State.popupOpen();
    });
  }
}
