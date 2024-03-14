import '@polkadot/extension-inject/crossenv';

import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, initEvmProvider, redirectIfPhishing, saveSoraCardToken } from '@extension-base/page';
import { type RequestSignatures } from '@extension-base/background/types/messages';
import { type FWEvmProvider } from '@extension-base/page/types';
import { eip6963ProviderInfo } from '@extension-base/const';
import packages from '../../../package.json';
import type Injected from '@extension-base/page/Injected';
import type { Message } from '@extension-base/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';
import { type InjectedWindow } from '@/extension/entry/types';
const win = window as Window & InjectedWindow;
const walletKey = 'fearlessWallet';
//TODO fix provider injection
win.injectedWeb3 = win.injectedWeb3 || {};
class FearlessWalletPlaceholder {
  provider: FWEvmProvider | undefined = undefined;
  connected = false;
  isConnected = () => false;
  version = packages.version;

  __waitProvider = (() => {
    if (this.provider) return Promise.resolve(this.provider);

    return new Promise((resolve, reject) => {
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
  })();

  on() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.on(...args);
    });
  }

  once() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.once(...args);
    });
  }

  off() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.off(...args);
    });
  }

  addListener() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.addListener(...args);
    });
  }

  removeListener() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.removeListener(...args);
    });
  }

  removeAllListeners() {
    this.__waitProvider.then((provider) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      provider.removeAllListeners(...args);
    });
  }

  async enable() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return provider.enable(...args);
  }

  async request() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return provider.send(...args);
  }

  async send() {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return provider.send(...args);
  }

  async sendAsync(args: any[]) {
    const provider = await this.__waitProvider;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    //@ts-ignore
    return provider.send(...args);
  }
}

win.injectedWeb3 = win.injectedWeb3 || {};

if (!win.injectedWeb3[walletKey]) {
  win.injectedWeb3[walletKey] = {
    isPlaceholder: true,
    version: packages.version,
    enable: async (origin) => {
      await new Promise((resolve, reject) => {
        let retry = 0;
        const interval = setInterval(() => {
          if (++retry > 30) {
            clearInterval(interval);
            reject(new Error('Fearless Wallet provider not found'));
          }

          if (!win.injectedWeb3[walletKey].isPlaceholder) {
            resolve(clearInterval(interval));
          }
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
    info: {
      uuid: eip6963ProviderInfo.uuid,
      name: eip6963ProviderInfo.name,
      icon: eip6963ProviderInfo.icon,
      rdns: eip6963ProviderInfo.rdns,
    },
    provider: win.fearlessWallet,
  });
  const event = new CustomEvent('eip6963:announceProvider', { detail });

  window.dispatchEvent(event);
};

win.addEventListener('eip6963:requestProvider', announceProvider);

announceProvider();
class Page {
  version: string = packages.version;

  private inject() {
    // small helper with the typescript types, just cast window
    const windowInject: any = window as Window & InjectedWindow; // don't clobber the existing object, we will add it (or create as needed)

    windowInject.injectedWeb3 = windowInject.injectedWeb3 || {}; // add our enable and saveSoraCardToken functions

    windowInject.injectedWeb3[walletKey] = {
      enable: (origin: string): Promise<Injected> => enable(origin),
      saveSoraCardToken: (token: string) => saveSoraCardToken(token),
      version: APP_VERSION,
    };
  }
  // Inject EVM Provider
  injectEvmExtension(evmProvider: FWEvmProvider): void {
    // small helper with the typescript types, just cast window
    const windowInject = window as Window & InjectedWindow;

    // add our enable function
    if (windowInject.fearlessWallet) {
      // Provider has been initialized in proxy mode
      windowInject.fearlessWallet.provider = evmProvider;
    } else {
      // Provider has been initialized in direct mode
      windowInject.fearlessWallet = evmProvider;
    }

    windowInject.dispatchEvent(new Event('fearlesswallet#initialized'));

    // Publish to global if win.ethereum is not available
    windowInject.addEventListener('load', () => {
      if (!windowInject.ethereum) {
        windowInject.ethereum = evmProvider;
        windowInject.dispatchEvent(new Event('ethereum#initialized'));
      }
    });
  }

  init() {
    this.setMaxListeners();

    redirectIfPhishing()
      .then((gotRedirected) => {
        if (!gotRedirected) this.inject();
      })
      .catch((e) => {
        console.warn(`Unable to determine if the site is in the phishing list: ${(e as Error).message}`);
        this.inject();
      });

    this.injectEvmExtension(initEvmProvider(this.version));
  }

  private setMaxListeners() {
    win.addEventListener('message', ({ data, source }: Message): void => {
      // only allow messages from our window, by the loader
      if (source !== window || data.origin !== MESSAGE_ORIGIN_CONTENT) {
        return;
      }

      if (data.id) {
        handleResponse(data as TransportRequestMessage<keyof RequestSignatures>);
      } else {
        console.error('Missing id for response.');
      }
    });
  }
}

new Page().init();
