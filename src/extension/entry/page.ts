import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, initEvmProvider, redirectIfPhishing, saveSoraCardToken } from '@extension-base/page';
import { type RequestSignatures } from '@extension-base/background/types/messages';
import { type FWEvmProvider } from '@extension-base/page/types';
import { eip6963ProviderInfo } from '@extension-base/const';
import packages from '../../../package.json';
import type Injected from '@extension-base/page/Injected';
import '@polkadot/extension-inject/chrome';
import type { Message } from '@extension-base/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';
import { type EIP6963ProviderDetail, type InjectedWindow } from '@/extension/entry/types';

class Page {
  version: string = packages.version;

  private inject() {
    // small helper with the typescript types, just cast window
    const windowInject: any = window as Window & InjectedWindow; // don't clobber the existing object, we will add it (or create as needed)

    windowInject.injectedWeb3 = windowInject.injectedWeb3 || {}; // add our enable and saveSoraCardToken functions

    windowInject.injectedWeb3['fearlessWallet'] = {
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
      windowInject.fearlessWallet.provider = evmProvider.provider;
    } else {
      // Provider has been initialized in direct mode
      windowInject.fearlessWallet = evmProvider;
    }

    windowInject.dispatchEvent(new Event('fearlesswallet#initialized'));

    // Publish to global if window.ethereum is not available
    windowInject.addEventListener('load', () => {
      if (!windowInject.ethereum) {
        windowInject.ethereum = evmProvider;
        windowInject.dispatchEvent(new Event('ethereum#initialized'));
      }

      this.inject6963EIP(evmProvider);
    });
  }

  inject6963EIP(provider: FWEvmProvider) {
    const _provider = new Proxy(provider, {
      get(target, key) {
        if (key === 'then') return Promise.resolve(target);

        return Reflect.get(target, key).bind(target);
      },

      deleteProperty() {
        return true;
      },
    });

    const announceProvider = () => {
      const detail: EIP6963ProviderDetail = Object.freeze({ info: eip6963ProviderInfo, provider: _provider });
      const event = new CustomEvent('eip6963:announceProvider', { detail });

      window.dispatchEvent(event);
    };

    window.addEventListener('eip6963:requestProvider', announceProvider);

    announceProvider();
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
    window.addEventListener('message', ({ data, source }: Message): void => {
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
