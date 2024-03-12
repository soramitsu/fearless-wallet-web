import { chrome } from '@extension-base/utils/crossenv';
import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import type { Message } from '@extension-base/types';

const port = chrome.runtime.connect({ name: PORT_CONTENT });

const onMessage = ({ data, source }: Message): void => {
  if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

  port.postMessage(data);
};

port.onMessage.addListener((data: any): void => {
  window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
});

port.onDisconnect.addListener(this.setListeners);

window.addEventListener('message', onMessage);

const script = document.createElement('script');
const container = document.head || document.documentElement;

script.src = chrome.runtime.getURL('page.js');
container.insertBefore(script, container.children[0]);
