// Copyright 2019-2022 @polkadot/extension-bg authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BehaviorSubject } from 'rxjs';
import { addMetadata, knownMetadata } from '@polkadot/extension-chains';
import { knownGenesis } from '@polkadot/networks/defaults';
import { assert } from '@polkadot/util';

import { TypeRegistry } from '@polkadot/types';

import {
  AuthorizeRequest,
  AuthRequest,
  AuthResponse,
  AuthUrls,
  MetadataRequest,
  MetaRequest,
  NORMAL_WINDOW_OPTS,
  POPUP_WINDOW_OPTS,
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
  IState,
} from '../types';
import { getId } from '../../utils';
import MetadataStore from '../../stores/Metadata';
import { stripUrl, withErrorLog } from './helpers';
import type { JsonRpcResponse, ProviderInterfaceCallback } from '@polkadot/rpc-provider/types';
import type { MetadataDef, ProviderMeta } from '@polkadot/extension-inject/types';

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

export const registry = new TypeRegistry();
const metaStore = new MetadataStore();

export async function initState() {
  extractMetadata(metaStore);

  await chrome.storage.local.set({
    authUrls: {},
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    windows: [],
    notification: 'popup',
    providers: {},
    connectedTabsUrl: [],
    cachedUnlocks: {},
  });
}

export default class State {
  static authUrls: AuthUrls = {};

  static defaultAuthAccountSelection: string[] = [];
  static authRequests: Record<string, AuthRequest> = {};
  static metaRequests: Record<string, MetaRequest> = {};
  static signRequests: Record<string, SignRequest> = {};
  static readonly authSubject: BehaviorSubject<AuthorizeRequest[]> = new BehaviorSubject<AuthorizeRequest[]>([]);
  static readonly metaSubject: BehaviorSubject<MetadataRequest[]> = new BehaviorSubject<MetadataRequest[]>([]);
  static readonly signSubject: BehaviorSubject<SigningRequest[]> = new BehaviorSubject<SigningRequest[]>([]);

  static get knownMetadata(): MetadataDef[] {
    return knownMetadata();
  }

  static async getFromStorage(key: (keyof IState)[]): Promise<Pick<IState, typeof key[number]>> {
    const values = (await chrome.storage.local.get(key).then((value) => value)) as Pick<IState, typeof key[number]>;

    return values;
  }

  private static async numAuthRequests() {
    return Object.keys(State.authRequests).length;
  }

  private static async numMetaRequests() {
    return Object.keys(State.metaRequests).length;
  }

  private static async numSignRequests() {
    return Object.keys(State.signRequests).length;
  }

  static async allAuthRequests(): Promise<AuthorizeRequest[]> {
    // const { authRequests } = await State.getFromStorage(['authRequests']);

    return Object.values(State.authRequests).map(({ id, request, url }): AuthorizeRequest => ({ id, request, url }));
  }

  static async allMetaRequests(): Promise<MetadataRequest[]> {
    return Object.values(State.metaRequests).map(({ id, request, url }): MetadataRequest => ({ id, request, url }));
  }

  static async allSignRequests(): Promise<SigningRequest[]> {
    return Object.values(State.signRequests).map(
      ({ account, id, request, url }): SigningRequest => ({ account, id, request, url })
    );
  }

  public async authUrls(): Promise<AuthUrls> {
    return State.authUrls;
  }

  static async popupClose(): Promise<void> {
    const { windows } = await State.getFromStorage(['windows']);

    windows?.forEach((id: number) => withErrorLog(() => chrome.windows.remove(id)));

    await chrome.storage.local.set({ windows: [] });
  }

  static async popupOpen(): Promise<void> {
    const { notification, windows } = await State.getFromStorage(['notification', 'windows']);
    if (notification && notification !== 'extension')
      chrome.windows.create(
        notification === 'window' ? NORMAL_WINDOW_OPTS : POPUP_WINDOW_OPTS,

        async (window): Promise<void> => {
          if (window) {
            windows.push(window.id || 0);

            await chrome.storage.local.set({ windows });
          }
        }
      );
  }

  static async injectFromStorage() {
    const { authUrls, defaultAuthAccountSelection } = await chrome.storage.local.get([
      'authUrls',
      'defaultAuthAccountSelection',
    ]);
    State.authUrls = authUrls;
    State.defaultAuthAccountSelection = defaultAuthAccountSelection;
  }

  static authComplete = (
    id: string,
    resolve: (resValue: AuthResponse) => void,
    reject: (error: Error) => void
  ): Resolver<AuthResponse> => {
    const complete = async (authorizedAccounts: string[] = []) => {
      const {
        id: idStr,
        request: { origin },
        url,
      } = State.authRequests[id];

      const stripedUrl = stripUrl(url);

      State.authUrls[stripedUrl] = {
        authorizedAccounts,
        count: 0,
        id: idStr,
        origin,
        url,
      };

      await State.saveCurrentAuthList();
      await State.updateDefaultAuthAccounts(authorizedAccounts);

      delete State.authRequests[id];

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
    const connectedTabs = urls
      .map((url) => {
        let strippedUrl = '';

        // the assert in stripUrl may throw for new tabs with "chrome://newtab/"
        try {
          strippedUrl = stripUrl(url);
        } catch (e) {
          console.error(e);
        }

        // return the stripped url only if this website is known
        return !!strippedUrl && State.authUrls[strippedUrl] ? strippedUrl : undefined;
      })
      .filter((value) => !!value) as string[];

    await chrome.storage.local.set({ connectedTabsUrl: connectedTabs });
  }

  static async getConnectedTabsUrl() {
    const { connectedTabsUrl } = await State.getFromStorage(['connectedTabsUrl']);

    return connectedTabsUrl;
  }

  static async deleteAuthRequest(requestId: string) {
    delete State.authRequests[requestId];

    State.updateIconAuth(true);
  }

  private static async saveCurrentAuthList() {
    await chrome.storage.local.set({ authUrls: State.authUrls });
  }

  private static async saveDefaultAuthAccounts() {
    await chrome.storage.local.set({ defaultAuthAccountSelection: State });
  }

  static async updateDefaultAuthAccounts(newList: string[]) {
    await chrome.storage.local.set({ defaultAuthAccountSelection: newList });

    State.saveDefaultAuthAccounts();
  }

  private static metaComplete = (
    id: string,
    resolve: (result: boolean) => void,
    reject: (error: Error) => void
  ): Resolver<boolean> => {
    const complete = async (): Promise<void> => {
      delete State.metaRequests[id];

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

  private static signComplete = (
    id: string,
    resolve: (result: ResponseSigning) => void,
    reject: (error: Error) => void
  ): Resolver<ResponseSigning> => {
    const complete = async (): Promise<void> => {
      delete State.signRequests[id];

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
    const entry = State.authUrls[url];

    assert(entry, `The source ${url} is not known`);

    delete State.authUrls[url];

    await chrome.storage.local.set({ authUrls: State.authUrls });

    State.saveCurrentAuthList();

    return State.authUrls;
  }

  static async updateIconAuth(shouldClose?: boolean): Promise<void> {
    const allAuthRequests = await State.allAuthRequests();

    State.authSubject.next(allAuthRequests);

    State.updateIcon(shouldClose);
  }

  static async updateIconMeta(shouldClose?: boolean): Promise<void> {
    const allMetaRequests = await State.allMetaRequests();

    State.metaSubject.next(allMetaRequests);
    State.updateIcon(shouldClose);
  }

  static async updateIconSign(shouldClose?: boolean): Promise<void> {
    const allSignRequests = await State.allSignRequests();

    State.signSubject.next(allSignRequests);
    State.updateIcon(shouldClose);
  }

  static async updateAuthorizedAccounts(authorizedAccountDiff: AuthorizedAccountsDiff): Promise<void> {
    authorizedAccountDiff.forEach(([url, authorizedAccountDiff]) => {
      State.authUrls[url].authorizedAccounts = authorizedAccountDiff;
    });

    State.saveCurrentAuthList();
  }

  static async authorizeUrl(url: string, request: RequestAuthorizeTab): Promise<AuthResponse> {
    const idStr = stripUrl(url);

    // Do not enqueue duplicate authorization requests.
    const isDuplicate = Object.values(State.authRequests).some((request) => request.idStr === idStr);

    assert(!isDuplicate, `The source ${url} has a pending authorization request`);

    if (State.authUrls[idStr]) {
      // this url was seen in the past
      assert(
        State.authUrls[idStr].authorizedAccounts || State.authUrls[idStr].isAllowed,
        `The source ${url} is not allowed to interact with this extension`
      );

      return {
        authorizedAccounts: [],
        result: false,
      };
    }

    return new Promise((res, rej): void => {
      const id = getId();

      const { reject, resolve } = State.authComplete(id, res, rej);

      State.authRequests[id] = {
        reject,
        resolve,
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
    const stripedUrl = stripUrl(url);
    const entry = State.authUrls[stripedUrl];

    assert(entry, `The source ${url} has not been enabled yet`);

    return true;
  }

  static async injectMetadata(url: string, request: MetadataDef): Promise<boolean> {
    return new Promise((resolve, reject): void => {
      const id = getId();

      State.metaRequests[id] = {
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
    return State.authRequests[id];
  }

  static async getMetaRequest(id: string): Promise<MetaRequest> {
    return State.metaRequests[id];
  }

  static async getSignRequest(id: string): Promise<SignRequest> {
    return State.signRequests[id];
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
    await chrome.storage.local.set({ injectedProviders });

    // Close provider connection when page is closed
    port.onDisconnect.addListener(async (): Promise<void> => {
      const provider = injectedProviders.get(port);

      if (provider) {
        withErrorLog(() => provider.disconnect());
      }

      injectedProviders.delete(port);
      await chrome.storage.local.set({ injectedProviders });
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
    metaStore.set(meta.genesisHash, meta);

    addMetadata(meta);
  }

  static async setNotification(notification: string): Promise<boolean> {
    await chrome.storage.local.set({ notification });

    return true;
  }

  static async sign(url: string, request: RequestSign, account: AccountJson): Promise<ResponseSigning> {
    const id = getId();

    return new Promise((resolve, reject): void => {
      State.signRequests[id] = {
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
