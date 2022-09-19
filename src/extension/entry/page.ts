import { MESSAGE_ORIGIN_CONTENT } from '@polkadot/extension-base/defaults';
import { injectExtension } from '@polkadot/extension-inject';
import { enable, handleResponse, redirectIfPhishing } from '@polkadot/extension-base/page';
import type { Message } from '../background/extension-base/src/types';
import type { RequestSignatures, TransportRequestMessage } from '@polkadot/extension-base/background/types';

class Page {
  private inject() {
    injectExtension(enable, {
      name: 'fearless-wallet',
      version: '0.0.1',
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
