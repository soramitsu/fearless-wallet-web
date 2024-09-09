import { getId } from '@extension-base/utils/utils';
import { PORT_EXTENSION } from '@extension-base/defaults';
import { chrome } from '@extension-base/utils/crossenv';
import type {
  MessageTypes,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
  Port,
} from '@extension-base/background/types/types';
// import type { Message } from '@extension-base/types';

interface Handler {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  subscriber?: (value: any) => void;
}

type Handlers = Record<string, Handler>;

let port: Port | null;
const handlers: Handlers = {};

function connect() {
  console.info('Connecting to background script', PORT_EXTENSION);
  port = chrome?.extension ? chrome.runtime?.connect({ name: PORT_EXTENSION }) : null;
  port?.onDisconnect.addListener(connect);

  //TODO: Stefan: вот тут нужно сообщение обработать
  const channel = new BroadcastChannel('sw-messages');
  channel.addEventListener('message', ({ data }) => {
    // console.info('Received', { handlers, data });
    const handler = handlers[data.id];

    if (!handler) {
      console.error(`Unknown response: ${JSON.stringify(data)}`);

      return;
    }

    console.info(`[handler] ${data.id}`, { handler, data });

    if (!handler.subscriber) delete handlers[data.id];

    if (data.subscription && handler.subscriber) handler.subscriber(data.subscription);
    else if (data.error) handler.reject(new Error(data.error));
    else handler.resolve(data.response);
  });

  // port?.onMessage.addListener((data: Message['data']): void => {
  //   const handler = handlers[data.id];
  //
  //   if (!handler) {
  //     console.error(`Unknown response: ${JSON.stringify(data)}`);
  //
  //     return;
  //   }
  //
  //   if (!handler.subscriber) delete handlers[data.id];
  //
  //   if (data.subscription && handler.subscriber) handler.subscriber(data.subscription);
  //   else if (data.error) handler.reject(new Error(data.error));
  //   else handler.resolve(data.response);
  // });
}

// setup a listener for messages, any incoming resolves the promise
function sendMessage<TMessageType extends MessageTypesWithNullRequest>(
  message: TMessageType
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypesWithNoSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType]
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypesWithSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType],
  subscriber: (data: SubscriptionMessageTypes[TMessageType]) => void
): Promise<ResponseTypes[TMessageType]>;
function sendMessage<TMessageType extends MessageTypes>(
  message: TMessageType,
  request?: RequestTypes[TMessageType],
  subscriber?: (data: unknown) => void
): Promise<ResponseTypes[TMessageType]> {
  return new Promise((resolve, reject): void => {
    const id = getId(message);
    console.info('handlers', { handlers, message, id, exact: handlers[id], port });
    handlers[id] = { reject, resolve, subscriber };

    // navigator.serviceWorker.controller?.postMessage({ id, message, request: request || {} });

    // port?.postMessage({ id, message, request: request || {} });

    navigator.serviceWorker.ready.then((registration) => {
      registration?.active?.postMessage({ id, message, request: request || {} });
    });
  });
}

connect();

export { sendMessage, connect };

export * from '@/extension/messaging/staking';
export * from '@/extension/messaging/pools';
export * from '@/extension/messaging/accounts';
export * from '@/extension/messaging/transfers';
export * from '@/extension/messaging/substrate-requests';
export * from '@/extension/messaging/onboarding';
export * from '@/extension/messaging/google';
export * from '@/extension/messaging/networks';
export * from '@/extension/messaging/balance';
export * from '@/extension/messaging/common';
export * from '@/extension/messaging/wallet-connect-requests';
export * from '@/extension/messaging/pools';
