import '@polkadot/extension-inject/crossenv';

import { MESSAGE_ORIGIN_CONTENT } from '@extension-base/defaults';
import { enable, handleResponse, redirectIfPhishing, saveSoraCardToken } from '@extension-base/page';
import { type RequestSignatures } from '@extension-base/background/types/messages';
import type { Message } from '@extension-base/types';
import type { TransportRequestMessage } from '@extension-base/background/types/types';
import { APP_VERSION } from '@/consts/global';

console.info('page.ts initialization');

class Page {
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
      if (source !== window || data.origin !== MESSAGE_ORIGIN_CONTENT) return;

      if (data.id) handleResponse(data as TransportRequestMessage<keyof RequestSignatures>);
      else console.error('Missing id for response.');
    });
  }
}

new Page().init();
