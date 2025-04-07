/* eslint-disable prefer-rest-params */
import '@polkadot/extension-inject/crossenv';
import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import {
  decryptForCosigner,
  enable,
  encryptByCosigner,
  handleResponse,
  initEvmProvider,
  redirectIfPhishing,
} from '@extension-base/page';
import { eip6963ProviderInfo } from '@extension-base/const';
import type { FWEvmProvider } from '@extension-base/page/types';
import type { Message } from '@extension-base/types';
import type {
  DecryptForCosignerData,
  EncryptByCosignerData,
  MessageTypes,
  TransportRequestMessage,
} from '@extension-base/background/types/types';
import type { InjectedWindow } from '@/extension/entry/types';
import { APP_VERSION } from '@/consts/global';

const win = window as Window & InjectedWindow;
const walletKey = 'fearless-wallet';

win.injectedWeb3 = win.injectedWeb3 || {};

class FearlessWalletPlaceholder {
  provider: FWEvmProvider | undefined = undefined; // TODO ???
  connected = false;
  isConnected = () => false;

  __waitProvider = (async () => {
    if (this.provider) return Promise.resolve(this.provider);

    const provider = await new Promise((resolve, reject) => {
      let retry = 0;

      const interval = setInterval(() => {
        if (++retry > 30) {
          clearInterval(interval);
          reject(new Error('Fearless Wallet not found'));
        }

        if (this.provider) {
          clearInterval(interval);
          resolve(this.provider);
        }
      }, 100);
    });

    return provider;
  })();

  on() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.on(...arguments);
    });
  }

  once() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.once(...arguments);
    });
  }

  off() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.off(...arguments);
    });
  }

  addListener() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.addListener(...arguments);
    });
  }

  removeListener() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.removeListener(...arguments);
    });
  }

  removeAllListeners() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.removeAllListeners(...arguments);
    });
  }

  async enable() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return await provider.enable(...arguments);
  }

  async request() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return await provider.send(...arguments);
  }

  async send() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return await provider.send(...arguments);
  }

  async sendAsync() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return await provider.send(...arguments);
  }
}

if (!win.injectedWeb3[walletKey]) {
  win.injectedWeb3[walletKey] = {
    isPlaceholder: true,
    version: APP_VERSION,
    decryptForCosigner: (data: DecryptForCosignerData) => decryptForCosigner(data),
    encryptByCosigner: (data: EncryptByCosignerData) => encryptByCosigner(data),
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
      enable: (origin: string) => enable(origin),
      decryptForCosigner: (data: DecryptForCosignerData) => decryptForCosigner(data),
      encryptByCosigner: (data: EncryptByCosignerData) => encryptByCosigner(data),
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
