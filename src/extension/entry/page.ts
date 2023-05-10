import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, saveSoraCardToken, handleResponse, redirectIfPhishing } from '@extension-base/page';
import type { Message } from '@extension-base/types';
import type { RequestSignatures, TransportRequestMessage } from '@extension-base/background/types';

class Page {
  private inject() {
    // small helper with the typescript types, just cast window
    const windowInject: any = window; // don't clobber the existing object, we will add it (or create as needed)

    windowInject.injectedWeb3 = windowInject.injectedWeb3 || {}; // add our enable function

    windowInject.injectedWeb3['fearless-wallet'] = {
      enable: (origin: string) => enable(origin),
      saveSoraCardToken: (token: string) => saveSoraCardToken(token),
      version: '1.0.0', // TODO
    };
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
