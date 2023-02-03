import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import browser from 'webextension-polyfill';
import type { Message } from '@extension-base/types';
class Content {
  private port = browser.runtime.connect({ name: PORT_CONTENT });

  private setListeners() {
    this.port.onMessage.addListener((data): void => {
      window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
    });

    window.addEventListener('message', ({ data, source }: Message): void => {
      if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

      this.port.postMessage(data);
    });
  }

  private injectScript() {
    const script = document.createElement('script');

    script.src = browser.runtime.getURL('page.js');

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

const content = new Content();
content.init();
