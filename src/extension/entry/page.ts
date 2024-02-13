import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, initEvmProvider, redirectIfPhishing, saveSoraCardToken } from '@extension-base/page';
import { type RequestSignatures } from '@extension-base/background/types/messages';
import packages from '../../../package.json';
import type { Message } from '@extension-base/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';
import { type EIP6963ProviderDetail, type EIP6963ProviderInfo, type InjectedWindow } from '@/extension/entry/types';
import { type FWEvmProvider } from '@/extension/background/extension-base/src/page/types';
class Page {
  version: string = packages.version;
  private inject() {
    // small helper with the typescript types, just cast window
    const windowInject: any = window; // don't clobber the existing object, we will add it (or create as needed)

    windowInject.injectedWeb3 = windowInject.injectedWeb3 || {}; // add our enable and saveSoraCardToken functions

    windowInject.injectedWeb3['fearless-wallet'] = {
      enable: (origin: string) => enable(origin),
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
      windowInject.fearlessWallet = evmProvider;
    } else {
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

  inject6963EIP = (provider: FWEvmProvider) => {
    // TODO: Need to confirm that infomation
    const info: EIP6963ProviderInfo = {
      uuid: 'd1dc1445-2b9c-4c17-877a-7790fadfcc05',
      name: 'Fearless Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbDpzcGFjZT0icHJlc2VydmUiIHN0eWxlPSJlbmFibGUtYmFja2dyb3VuZDpuZXcgMCAwIDQwMCAxNzMiCiAgdmlld0JveD0iMCAwIDQwMCAxNzMiPgogIDxwYXRoIGZpbGw9IiNFMDciCiAgICBkPSJNMzk1LjQgMjYuMSAyNDAuNyA0Ni4zYy0uOC4xLTEuNy42LTIuNCAxLjFMMjI1LjYgNjBjLTEuNiAxLjYtNC4xIDEuNi01LjggMGwtMi4zLTIuM2MtMS42LTEuNi0xLjYtNC4yIDAtNS44bDE1LjMtMTUuMWMxLjYtMS42IDEuNi00LjIgMC01LjhsLTMwLTI5LjZjLTEuNi0xLjYtNC4xLTEuNi01LjggMGwtMzAgMjkuOGMtMS42IDEuNi0xLjYgNC4yIDAgNS44bDE1LjMgMTVjMS42IDEuNiAxLjYgNC4yIDAgNS44bC0yLjMgMi4zYy0xLjYgMS42LTQuMSAxLjYtNS44IDBsLTEyLjctMTIuNmMtLjctLjYtMS40LTEtMi40LTEuMUw0LjYgMjYuMWMtMy44LS42LTYuMiA0LjItMy40IDYuOWwzMy43IDMzLjVjMi41IDIuNS43IDYuOS0yLjggNi45LTMuNyAwLTUuNCA0LjQtMi44IDYuOWwzMS41IDMxLjRjLjYuNiAxLjEuOCAxLjggMS4xbDEwNy41IDI3Yy44LjMgMS43LjcgMi4zIDEuNGwxNi43IDIxLjJjMyA0LjEgNy45IDguOSA3LjkgOC45IDEuNiAxLjYgNC4xIDEuNiA1LjggMCAwIDAgNC4xLTQuMiA3LjktOC45bDE2LjctMjEuMmMuNi0uNyAxLjMtMS4zIDIuMy0xLjRsMTA3LjctMjdjLjctLjEgMS40LS42IDEuOC0xLjFsMzEuNS0zMS40YzIuNS0yLjUuNy02LjktMi44LTYuOS0zLjcgMC01LjQtNC40LTIuOC02LjlMMzk4LjggMzNjMi44LTIuOC40LTcuNS0zLjQtNi45eiIgLz4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYSIgeDE9IjQ3LjUiIHgyPSI0Ny41IiB5MT0iMS41MjgiIHkyPSI0Mi4wMTEiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iIzcwRSIgLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjRTA3IiAvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICA8L2RlZnM+Cjwvc3ZnPg==', //assets/icons/fw-logo.svg base64
      rdns: 'io.fearlesswallet',
    };

    const _provider = new Proxy(provider, {
      get(target, key) {
        if (key === 'then') {
          return Promise.resolve(target);
        }

        return Reflect.get(target, key).bind(target);
      },
      deleteProperty() {
        return true;
      },
    });

    const announceProvider = () => {
      const detail: EIP6963ProviderDetail = Object.freeze({ info: info, provider: _provider });
      const event = new CustomEvent('eip6963:announceProvider', { detail });

      window.dispatchEvent(event);
    };

    window.addEventListener('eip6963:requestProvider', announceProvider);

    announceProvider();
  };

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
