import '@polkadot/extension-inject/crossenv';

import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import { type Port } from '@extension-base/background/types/types';
import type { Message } from '@extension-base/types';

let port: Port;

class Content {
  private setListeners() {
    port = chrome.runtime.connect({ name: PORT_CONTENT });

    const onMessage = ({ data, source }: Message): void => {
      if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

      port.postMessage(data);
    };

    port.onMessage.addListener((data): void => {
      window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
    });

    port.onDisconnect.addListener(this.setListeners);

    window.addEventListener('message', onMessage);
  }

  private injectScript() {
    const script = document.createElement('script');

    script.src = chrome.runtime.getURL('page.js');

    script.onload = (): void => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };

    (document.head || document.documentElement).appendChild(script);
  }

  public init() {
    this.setListeners();
    this.injectScript();
  }
}

new Content().init();
