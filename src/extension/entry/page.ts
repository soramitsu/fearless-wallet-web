import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, initEvmProvider, redirectIfPhishing, saveSoraCardToken } from '@extension-base/page';
import { type RequestSignatures } from '@extension-base/background/types/messages';
import packages from '../../../package.json';
import type { Message } from '@extension-base/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';
import { type EIP6963ProviderDetail, type EIP6963ProviderInfo, type InjectedWindow } from '@/extension/entry/types';
import { type EvmProvider } from '@/extension/background/extension-base/src/page/types';
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
  injectEvmExtension(evmProvider: EvmProvider): void {
    // small helper with the typescript types, just cast window
    const windowInject = window as Window & InjectedWindow;

    // add our enable function
    if (windowInject.FW) {
      // Provider has been initialized in proxy mode
      windowInject.FW = evmProvider;
    } else {
      // Provider has been initialized in direct mode
      windowInject.FW = evmProvider;
    }

    windowInject.dispatchEvent(new Event('subwallet#initialized'));

    // Publish to global if window.ethereum is not available
    windowInject.addEventListener('load', () => {
      if (!windowInject.ethereum) {
        windowInject.ethereum = evmProvider;
        windowInject.dispatchEvent(new Event('ethereum#initialized'));
      }

      this.inject6963EIP(evmProvider);
    });
  }

  inject6963EIP = (provider: EvmProvider) => {
    // TODO: Need to confirm that infomation
    const info: EIP6963ProviderInfo = {
      uuid: 'd1dc1445-2b9c-4c17-877a-7790fadfcc05',
      name: 'Fearless Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgZmlsbD0ibm9uZSI+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjQiIGZpbGw9InVybCgjYSkiLz48ZyBmaWx0ZXI9InVybCgjYikiPjxjaXJjbGUgY3g9IjI1IiBjeT0iMjUiIHI9IjI0IiBmaWxsPSIjMDAwIiBmaWxsLW9wYWNpdHk9Ii4xIi8+PGNpcmNsZSBjeD0iMjUiIGN5PSIyNSIgcj0iMjQuNSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utb3BhY2l0eT0iLjEiLz48L2c+PHBhdGggZmlsbD0iI2ZmZiIgZD0ibTYuODQ5IDIzLjg5Ni0yLjU4Ni0yLjY1MWMtLjY4Ny0uNzA0LjA2OC0xLjcyMiAxLjE1OS0xLjU2MmwxNS4yMTUgMi4xOTVjLjM1NC4wNTIuNzE4LS4wMzUuOTgtLjIzNC40NjgtLjM1NC4yMDItLjk1LS4yNDgtMS4zMTlsLS4yNS0uMjA2Yy0uNDYzLS4zNzktLjYwMy0uOTg4LS4xNC0xLjM2OEwyNC40IDE1LjI5Yy40NzEtLjM4NyAxLjI0Mi0uMzg3IDEuNzEzIDBsMy4yMyAzLjQ2MWMuNDYyLjM4LjMyMi45OS0uMTQgMS4zNjhsLS4yNTIuMjA2Yy0uNDUuMzY5LS43MTUuOTY1LS4yNDggMS4zMTkuMjYzLjE5OS42MjcuMjg2Ljk4MS4yMzRsMTQuODk0LTIuMTQ4YzEuMTI3LS4xNjUgMS44NzUuOTE4IDEuMTEgMS42MDhsLTIuMzAyIDIuMDhjLS40MDcuMzY3LS4zNDkuOTM2LjEyNiAxLjI0NC40ODcuMzE2LjUyOC44OTUuMDU3IDEuMjI2YTI2LjUzMyAyNi41MzMgMCAwIDEtNi4zNCAzLjIzNWMtMy44NjcgMS4zNi02LjQzMyAxLjkzLTYuOTk5IDIuMDU2YTEuNTA3IDEuNTA3IDAgMCAwLS4yNDcuMDc3bC0uODM4LjM0NGExLjE0IDEuMTQgMCAwIDAtLjQ5Mi4zNzJsLTIuNDU3IDMuNTVjLS40NjYuNjM3LTEuNjA1LjYzNy0yLjA3MSAwbC0yLjQ1Ny0zLjU1YTEuMTQgMS4xNCAwIDAgMC0uNDkyLS4zNzJsLS44MzgtLjM0NGExLjUxMyAxLjUxMyAwIDAgMC0uMjQ3LS4wNzZjLS41NjctLjEyNi0zLjEzMy0uNjk3LTctMi4wNTctMy4xNDUtMS4xMDUtNS40MzYtMi41ODQtNi41MDktMy4zNTYtLjM2Ni0uMjYzLS4zMTItLjcyLjA5Mi0uOTQ1LjM3OS0uMjEuNDU5LS42MzUuMTc1LS45MjZ6Ii8+PGRlZnM+PHJhZGlhbEdyYWRpZW50IGlkPSJhIiBjeD0iMCIgY3k9IjAiIHI9IjEiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMCAyNCAtMjQgMCAyNSAyNSkiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBzdG9wLWNvbG9yPSIjRTc3Ii8+PHN0b3Agb2Zmc2V0PSIuNTIxIiBzdG9wLWNvbG9yPSIjRTA3Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjNzdFIi8+PC9yYWRpYWxHcmFkaWVudD48ZmlsdGVyIGlkPSJiIiB3aWR0aD0iODIiIGhlaWdodD0iODIiIHg9Ii0xNiIgeT0iLTE2IiBjb2xvci1pbnRlcnBvbGF0aW9uLWZpbHRlcnM9InNSR0IiIGZpbHRlclVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PGZlRmxvb2QgZmxvb2Qtb3BhY2l0eT0iMCIgcmVzdWx0PSJCYWNrZ3JvdW5kSW1hZ2VGaXgiLz48ZmVHYXVzc2lhbkJsdXIgaW49IkJhY2tncm91bmRJbWFnZSIgc3RkRGV2aWF0aW9uPSI4Ii8+PGZlQ29tcG9zaXRlIGluMj0iU291cmNlQWxwaGEiIG9wZXJhdG9yPSJpbiIgcmVzdWx0PSJlZmZlY3QxX2JhY2tncm91bmRCbHVyXzIxMjdfMTA1NTA2Ii8+PGZlQmxlbmQgaW49IlNvdXJjZUdyYXBoaWMiIGluMj0iZWZmZWN0MV9iYWNrZ3JvdW5kQmx1cl8yMTI3XzEwNTUwNiIgcmVzdWx0PSJzaGFwZSIvPjwvZmlsdGVyPjwvZGVmcz48L3N2Zz4=', //assets/icons/wallet-logo.svg base64
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
    this.injectEvmExtension(initEvmProvider(this.version));

    redirectIfPhishing()
      .then((gotRedirected) => {
        if (!gotRedirected) this.inject();
      })
      .catch((e) => {
        console.warn(`Unable to determine if the site is in the phishing list: ${(e as Error).message}`);
        this.inject();
      });
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
