// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { MessageTypesWithSubscriptions, Port, SubscriptionMessageTypes, Subscriptions } from '../types';
const subscriptions: Subscriptions = {};

// return a subscription callback, that will send the data to the caller via the port
export function createSubscription<TMessageType extends MessageTypesWithSubscriptions>(
  id: string,
  port: Port
): (data: SubscriptionMessageTypes[TMessageType]) => void {
  subscriptions[id] = port;

  return (subscription: unknown): void => {
    if (subscriptions[id]) {
      port.postMessage({ id, subscription });
    }
  };
}

// clear a previous subscriber
export async function unsubscribe(id: string): Promise<void> {
  if (subscriptions[id]) {
    console.info(`Unsubscribing from ${id}`);

    delete subscriptions[id];
    await chrome.storage.local.set({ subscriptions });
  } else {
    console.error(`Unable to unsubscribe from ${id}`);
  }
}

export function isSubscriptionRunning(id: string): boolean {
  return !!subscriptions[id];
}
