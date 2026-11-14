import { chrome } from '@extension-base/utils/crossenv';
import { MESSAGE_ORIGIN_CONTENT, MESSAGE_ORIGIN_PAGE, PORT_CONTENT } from '@extension-base/defaults';
import type { Message } from '@extension-base/types';

type PageRequest = Message['data'] & { message?: string; request?: unknown };

const PORT_LOST = 'Connection to Fearless Wallet was lost. Check the wallet for an open request before you try again.';
const NOT_SENT = 'Fearless Wallet could not be reached. Reload the page and try again.';

let port: chrome.runtime.Port | undefined;
const waiting: PageRequest[] = [];
// Requests sent on the current port that have no answer yet.
const outstanding = new Set<string>();

// The page's event subscriptions, which last until the port closes.
const SUBSCRIPTION_MESSAGES = new Set<string>([
  'evm(events.subscribe)',
  'solana(events.subscribe)',
  'iroha(events.subscribe)',
  'pub(accounts.subscribe)',
]);
// Subscriptions the wallet accepted, by request id. The wallet stops its worker when nothing needs it, which closes the
// port and ends them without the page knowing. The next request sends them again on its new port, so the page's
// listeners work again without the page waking the wallet by itself.
const subscriptions = new Map<string, PageRequest>();
// Subscriptions sent on the current port that have no answer yet, and those of them sent again by this script, whose
// answer the page already had.
const subscribing = new Map<string, PageRequest>();
const resent = new Set<string>();

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
  subscribing.clear();
  resent.clear();
};

// The port opens on the page's first request, not at page load, so a page that never asks does not start the wallet.
const connect = (): chrome.runtime.Port => {
  const opened = chrome.runtime.connect({ name: PORT_CONTENT });

  opened.onMessage.addListener((data: Message['data']): void => {
    if (opened !== port) return;
    // Subscription updates carry their request's id; only the answer itself settles it.
    if (!data.subscription) {
      outstanding.delete(data.id);

      const request = subscribing.get(data.id);

      if (request) {
        subscribing.delete(data.id);
        if (data.error) subscriptions.delete(data.id);
        else subscriptions.set(data.id, request);
        if (resent.delete(data.id)) return;
      }
    }
    toPage(data);
  });
  // No reconnect here: the next request opens a port, so an idle page never keeps the worker running.
  opened.onDisconnect.addListener((): void => {
    if (opened === port) dropPort();
  });

  return opened;
};

const send = (data: PageRequest): void => {
  try {
    if (!port) {
      port = connect();
      subscriptions.forEach((request, id) => {
        port?.postMessage(request);
        subscribing.set(id, request);
        resent.add(id);
      });
    }
    port.postMessage(data);
    if (data.id) outstanding.add(data.id);
    if (data.id && data.message && SUBSCRIPTION_MESSAGES.has(data.message)) subscribing.set(data.id, data);
    if (data.message === 'pub(accounts.unsubscribe)') subscriptions.delete((data.request as { id?: string } | null)?.id ?? '');
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
