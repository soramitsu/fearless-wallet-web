import { getId } from '@extension-base/utils/utils';
import { PORT_EXTENSION } from '@extension-base/defaults';
import { chrome } from '@extension-base/utils/crossenv';
import { handlers as handlersFunc } from '@extension-base/background/handlers';
import type {
  MessageTypes,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
  Port,
  TransportRequestMessage,
} from '@extension-base/background/types/types';
import type { Message } from '@extension-base/types';
import { IS_EXTENSION } from '@/consts/global';

interface Handler {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  subscriber?: (value: any) => void;
}

type Handlers = Record<string, Handler>;

let port: Port | null;
let isPending = true;
const handlers: Handlers = {};

function connect() {
  console.info('Connecting to background script', PORT_EXTENSION, IS_EXTENSION);

  port = chrome?.extension ? chrome.runtime?.connect({ name: PORT_EXTENSION }) : null;
  port?.onDisconnect.addListener(connect);

  if (IS_EXTENSION) {
    port?.onMessage.addListener((data: Message['data']): void => {
      const handler = handlers[data.id];

      if (!handler) {
        console.error(`Unknown response: ${JSON.stringify(data)}`);

        return;
      }

      if (!handler.subscriber) delete handlers[data.id];

      if (data.subscription && handler.subscriber) handler.subscriber(data.subscription);
      else if (data.error) handler.reject(new Error(data.error));
      else handler.resolve(data.response);
    });
  } else {
    const channel = new BroadcastChannel('sw-messages');
    channel.addEventListener('message', ({ data }) => {
      const handler = handlers[data.id];

      if (!handler) {
        console.error(`Unknown response: ${JSON.stringify(data)}`);

        return;
      }

      if (!handler.subscriber) delete handlers[data.id];

      if (data.subscription && handler.subscriber) handler.subscriber(data.subscription);
      else if (data.error) handler.reject(new Error(data.error));
      else handler.resolve(data.response);
    });
  }
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

    handlers[id] = { reject, resolve, subscriber };

    const notHaveServiceWorker = !('serviceWorker' in navigator) || isPending;

    if (!IS_EXTENSION && notHaveServiceWorker) {
      console.info('[worker] no worker go direct message');

      handlersFunc({ id, message, request: request ?? {} } as TransportRequestMessage<MessageTypes>);
    }

    if (IS_EXTENSION) port?.postMessage({ id, message, request: request ?? {} });
    else {
      navigator.serviceWorker?.ready.then((registration) => {
        isPending = false;

        registration?.active?.postMessage({ id, message, request: request ?? {} });
      });
    }
  });
}

connect();

export { sendMessage };

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
