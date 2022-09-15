// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import State from './State';
import type { MessageTypesWithSubscriptions, SubscriptionMessageTypes } from '../types';

// return a subscription callback, that will send the data to the caller via the port
export async function createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
  id: string,
  port: chrome.runtime.Port
): Promise<(data: SubscriptionMessageTypes[TMessageType]) => void> {
  const { subscriptions } = await State.getFromStorage(['subscriptions']);
  subscriptions[id] = port;

  return (subscription: unknown): void => {
    if (subscriptions[id]) {
      port.postMessage({ id, subscription });
    }
  };
}

// clear a previous subscriber
export async function unsubscribe(id: string): Promise<void> {
  const { subscriptions } = await State.getFromStorage(['subscriptions']);

  if (subscriptions[id]) {
    console.info(`Unsubscribing from ${id}`);

    delete subscriptions[id];
    await chrome.storage.local.set({ subscriptions });
  } else {
    console.error(`Unable to unsubscribe from ${id}`);
  }
}
