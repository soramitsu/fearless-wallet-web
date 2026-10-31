import { chrome } from '@extension-base/utils/crossenv';
import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import type { Message } from '@extension-base/types';

const PORT_LOST = 'Connection to Fearless Wallet was lost. Check the wallet for an open request before you try again.';
const NOT_SENT = 'Fearless Wallet could not be reached. Reload the page and try again.';

let port: chrome.runtime.Port | undefined;
const waiting: Message['data'][] = [];
// Requests sent on the current port that have no answer yet.
const outstanding = new Set<string>();

const toPage = (data: object): void => {
  window.postMessage({ ...data, origin: MESSAGE_ORIGIN_CONTENT }, '*');
};

// A closed port delivers nothing more. Its open requests fail, so the page's retry goes out on a new port.
const dropPort = (): void => {
  const closed = port;

  port = undefined;
  try {
    closed?.disconnect();
  } catch {
    // It is closed already.
  }
  outstanding.forEach((id) => toPage({ id, error: PORT_LOST }));
  outstanding.clear();
};

// The port opens on the page's first request, not at page load, so a page that never asks does not start the wallet.
const connect = (): chrome.runtime.Port => {
  const opened = chrome.runtime.connect({ name: PORT_CONTENT });

  opened.onMessage.addListener((data: Message['data']): void => {
    if (opened !== port) return;
    // Subscription updates carry their request's id; only the answer itself settles it.
    if (!data.subscription) outstanding.delete(data.id);
    toPage(data);
  });
  // No reconnect here: the next request opens a port, so an idle page never keeps the worker running.
  opened.onDisconnect.addListener((): void => {
    if (opened === port) dropPort();
  });

  return opened;
};

const send = (data: Message['data']): void => {
  try {
    port ??= connect();
    port.postMessage(data);
    if (data.id) outstanding.add(data.id);
  } catch {
    // Not sent: the wallet was updated or removed, or this port is closing and the next request gets a new one.
    if (data.id) toPage({ id: data.id, error: NOT_SENT });
  }
};

const onMessage = ({ data, source }: Message): void => {
  if (source !== window || data.origin !== MESSAGE_ORIGIN_PAGE) return;

  if ((document as Document & { prerendering?: boolean }).prerendering) waiting.push(data);
  else send(data);
};

window.addEventListener('message', onMessage);

// A port opened while the page is prerendered keeps that sender after the page is shown, and the background refuses
// it. Requests wait until the page is shown.
document.addEventListener('prerenderingchange', () => waiting.splice(0).forEach(send), { once: true });

// Chrome closes the port when the page enters the back/forward cache, without a disconnect event here.
window.addEventListener('pageshow', (event: PageTransitionEvent) => {
  if (event.persisted) dropPort();
});

const script = document.createElement('script');
const container = document.head || document.documentElement;

script.src = chrome.runtime.getURL('page.js');
container.insertBefore(script, container.children[0]);
