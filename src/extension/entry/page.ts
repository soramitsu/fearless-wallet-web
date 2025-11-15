import '@polkadot/extension-inject/crossenv';
import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, initEvmProvider, redirectIfPhishing } from '@extension-base/page';
import { eip6963ProviderInfo } from '@extension-base/const';
import type { JsonRpcPayload, JsonRpcResponse, RequestArguments } from '@json-rpc-tools/utils';
import type { JsonRpcRequest } from 'json-rpc-engine';
import type { FWEvmProvider, JsonRpcCallback, SendSyncJsonRpcRequest } from '@extension-base/page/types';
import type { Message } from '@extension-base/types';
import type { MessageTypes, TransportRequestMessage } from '@extension-base/background/types/types';
import type { InjectedWindow } from '@/extension/entry/types';
import type { Injected } from '@polkadot/extension-inject/types';
import { APP_VERSION } from '@/consts/global';

const win = window as Window & InjectedWindow;
const walletKey = 'fearless-wallet';

type JsonRpcParams = JsonRpcPayload extends { params?: infer P } ? P : never;

win.injectedWeb3 = win.injectedWeb3 || {};

class FearlessWalletPlaceholder implements FWEvmProvider {
  provider: FWEvmProvider | undefined = undefined;
  connected = false;
  private readonly waitProvider: Promise<FWEvmProvider>;

  constructor() {
    this.waitProvider = new Promise<FWEvmProvider>((resolve, reject) => {
      if (this.provider) {
        this.connected = this.provider.isConnected();
        resolve(this.provider);

        return;
      }

      let retry = 0;
      const interval = window.setInterval(() => {
        retry += 1;

        if (retry > 30) {
          window.clearInterval(interval);
          reject(new Error('Fearless Wallet not found'));

          return;
        }

        if (!this.provider) return;

        window.clearInterval(interval);
        this.connected = this.provider.isConnected();
        resolve(this.provider);
      }, 100);
    });
  }

  private async resolveProvider(): Promise<FWEvmProvider> {
    const provider = await this.waitProvider;
    this.connected = provider.isConnected();

    return provider;
  }

  isConnected(): boolean {
    return this.provider?.isConnected() ?? this.connected;
  }

  on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    void this.resolveProvider()
      .then((provider) => provider.on(event, listener))
      .catch(console.error);

    return this;
  }

  once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    void this.resolveProvider()
      .then((provider) => provider.once(event, listener))
      .catch(console.error);

    return this;
  }

  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    void this.resolveProvider()
      .then((provider) => provider.off(event, listener))
      .catch(console.error);

    return this;
  }

  addListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    void this.resolveProvider()
      .then((provider) => provider.addListener(event, listener))
      .catch(console.error);

    return this;
  }

  removeListener(event: string | symbol, listener: (...args: unknown[]) => void): this {
    void this.resolveProvider()
      .then((provider) => provider.removeListener(event, listener))
      .catch(console.error);

    return this;
  }

  removeAllListeners(event?: string | symbol): this {
    void this.resolveProvider()
      .then((provider) => provider.removeAllListeners(event))
      .catch(console.error);

    return this;
  }

  enable(origin?: string): Promise<string[]> {
    return this.resolveProvider().then((provider) => provider.enable(origin));
  }

  request<T>(args: RequestArguments): Promise<T> {
    return this.resolveProvider().then((provider) => provider.request<T>(args));
  }

  send<T>(
    methodOrPayload: string | SendSyncJsonRpcRequest | JsonRpcRequest<unknown>,
    callbackOrParams?: JsonRpcCallback<T> | JsonRpcParams
  ): Promise<unknown> | JsonRpcResponse<T> | void {
    return this.resolveProvider().then(
      (provider) => provider.send<T>(methodOrPayload, callbackOrParams) as Promise<unknown> | JsonRpcResponse<T> | void
    );
  }

  sendAsync<T>(payload: JsonRpcRequest<T>, callback: JsonRpcCallback<T>): void {
    void this.resolveProvider()
      .then((provider) => provider.sendAsync(payload, callback))
      .catch((error: unknown) => {
        callback(error instanceof Error ? error : new Error(String(error)));
      });
  }
}

if (!win.injectedWeb3[walletKey]) {
  win.injectedWeb3[walletKey] = {
    isPlaceholder: true,
    version: APP_VERSION,
    enable: async (origin) => {
      await new Promise((resolve, reject) => {
        let retry = 0;

        const interval = setInterval(() => {
          if (++retry > 30) {
            clearInterval(interval);

            reject(new Error('Fearless Wallet provider not found'));
          }

          if (!win.injectedWeb3[walletKey].isPlaceholder) resolve(clearInterval(interval));
        }, 100);
      });

      return win.injectedWeb3[walletKey].enable(origin);
    },
  };
}

win.fearlessWallet = new Proxy(new FearlessWalletPlaceholder(), {
  get(obj, key) {
    if (key === 'provider') return undefined;

    const target = obj.provider || obj;

    if (key === 'then') return Promise.resolve(target);

    const proxyTarget = Reflect.get(target, key);

    if (typeof proxyTarget?.bind === 'function') return proxyTarget.bind(target);

    return proxyTarget;
  },
});

const announceProvider = () => {
  const detail = Object.freeze({
    provider: win.fearlessWallet,
    info: {
      uuid: eip6963ProviderInfo.uuid,
      name: eip6963ProviderInfo.name,
      icon: eip6963ProviderInfo.icon,
      rdns: eip6963ProviderInfo.rdns,
    },
  });

  const event = new CustomEvent('eip6963:announceProvider', { detail });

  window.dispatchEvent(event);
};

win.addEventListener('eip6963:requestProvider', announceProvider);

announceProvider();

class Page {
  static async init() {
    this.setMaxListeners();
    this.injectEvm();

    const gotRedirected = await redirectIfPhishing();

    if (gotRedirected) return;

    this.injectSubstrate();
  }

  static injectSubstrate() {
    const windowInject = window as Window & InjectedWindow;

    windowInject.injectedWeb3 = windowInject.injectedWeb3 || {};

    windowInject.injectedWeb3[walletKey] = {
      enable: (origin: string) => enable(origin) as Promise<Injected>,
      version: APP_VERSION,
    };
  }

  static injectEvm(): void {
    const evmProvider = initEvmProvider();
    const windowInject = window as Window & InjectedWindow;

    if (windowInject.fearlessWallet) windowInject.fearlessWallet.provider = evmProvider;
    else windowInject.fearlessWallet = evmProvider;

    windowInject.dispatchEvent(new Event('fearlesswallet#initialized'));

    // Publish to global if win.ethereum is not available
    windowInject.addEventListener('load', () => {
      if (!windowInject.ethereum) {
        windowInject.ethereum = evmProvider;
        windowInject.dispatchEvent(new Event('ethereum#initialized'));
      }
    });
  }

  static setMaxListeners() {
    win.addEventListener('message', ({ data, source }: Message): void => {
      // only allow messages from our window, by the loader
      if (source !== window || data.origin !== MESSAGE_ORIGIN_CONTENT) return;

      if (data.id) handleResponse(data as TransportRequestMessage<MessageTypes>);
      else console.error('Missing id for response.');
    });
  }
}

Page.init();
