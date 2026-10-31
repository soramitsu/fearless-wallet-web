import { chrome } from '@extension-base/utils/crossenv';
import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import type { Message } from '@extension-base/types';

let port: chrome.runtime.Port | undefined;
const waiting: Message['data'][] = [];

const connect = (): void => {
  port = chrome.runtime.connect({ name: PORT_CONTENT });

  port.onMessage.addListener((data): void => {
    window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
  });

  waiting.splice(0).forEach((data) => port?.postMessage(data));
};

const onMessage = ({ data, source }: Message): void => {
  if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

  if (port) port.postMessage(data);
  else waiting.push(data);
};

window.addEventListener('message', onMessage);

// A port opened while the page is prerendered keeps that sender after the page is shown, and the background refuses
// it. Requests wait until the page is shown.
if ((document as Document & { prerendering?: boolean }).prerendering) {
  document.addEventListener('prerenderingchange', connect, { once: true });
} else connect();

const script = document.createElement('script');
const container = document.head || document.documentElement;

script.src = chrome.runtime.getURL('page.js');
container.insertBefore(script, container.children[0]);
