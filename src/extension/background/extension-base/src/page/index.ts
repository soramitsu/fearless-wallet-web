import Injected from '@extension-base/page/Injected';
import { MESSAGE_ORIGIN_PAGE } from '@extension-base/defaults';
import { getId } from '@extension-base/utils/utils';
import { FearlessWalletEvmProvider } from '@extension-base/page/FearlessWalletEvmProvider';
import { FearlessWalletIrohaProvider } from '@extension-base/page/FearlessWalletIrohaProvider';
import { FearlessWalletSolanaProvider } from '@extension-base/page/FearlessWalletSolanaProvider';
import type { FWEvmProvider, FWIrohaProvider, FWSolanaProvider, Handlers } from '@extension-base/page/types';
import type {
  MessageTypes,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  RequestTypes,
  ResponseTypes,
  SubscriptionMessageTypes,
  TransportRequestMessage,
  TransportResponseMessage,
} from '@extension-base/background/types/types';

const handlers: Handlers = {};

// a generic message sender that creates an event, returning a promise that will
// resolve once the event is resolved (by the response listener just below this)
export function sendMessage<TMessageType extends MessageTypesWithNullRequest>(
  message: TMessageType
): Promise<ResponseTypes[TMessageType]>;
export function sendMessage<TMessageType extends MessageTypesWithNoSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType]
): Promise<ResponseTypes[TMessageType]>;
export function sendMessage<TMessageType extends MessageTypesWithSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType],
  subscriber: (data: SubscriptionMessageTypes[TMessageType]) => void
): Promise<ResponseTypes[TMessageType]>;

export function sendMessage<TMessageType extends MessageTypes>(
  message: TMessageType,
  request?: RequestTypes[TMessageType],
  subscriber?: (data: unknown) => void
): Promise<ResponseTypes[TMessageType]> {
  return new Promise((resolve, reject): void => {
    const id = getId();

    handlers[id] = { reject, resolve, subscriber };

    const transportRequestMessage: TransportRequestMessage<TMessageType> = {
      id,
      message,
      origin: MESSAGE_ORIGIN_PAGE,
      request: request || (null as RequestTypes[TMessageType]),
    };

    window.postMessage(transportRequestMessage, '*');
  });
}

// the enable function, called by the dapp to allow access
export async function enable(origin: string): Promise<Injected> {
  await sendMessage('pub(authorize.tab)', { origin });

  return new Injected(sendMessage);
}

// redirect users if this page is considered as phishing, otherwise return false
export async function redirectIfPhishing(): Promise<boolean> {
  const res = await sendMessage('pub(phishing.redirectIfDenied)');

  return res;
}

export function handleResponse<TMessageType extends MessageTypes>(
  data: TransportResponseMessage<TMessageType> & { subscription?: string }
): void {
  const handler = handlers[data.id];

  if (!handler) {
    console.error(`Unknown response: ${JSON.stringify(data)}`);

    return;
  }

  if (!handler.subscriber) delete handlers[data.id];

  if (data.subscription) handler.subscriber?.(data.subscription);
  else if (data.error) handler.reject(new Error(data.error));
  else handler.resolve(data.response);
}

export function initEvmProvider(): FWEvmProvider {
  return new FearlessWalletEvmProvider();
}

export function initSolanaProvider(): FWSolanaProvider {
  return new FearlessWalletSolanaProvider();
}

export function initIrohaProvider(): FWIrohaProvider {
  return new FearlessWalletIrohaProvider();
}
