// Copyright 2019-2022 @polkadot/extension authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { assert } from '@polkadot/util';

import { PORT_EXTENSION } from '../../defaults';
import Extension from './Extension';
import Tabs from './Tabs';
import State from './State';
import type { MessageTypes, Port, TransportRequestMessage } from '../types/types';
export const state = new State();
export const extension = new Extension();
export const tabs = new Tabs(state);

// Migration
async function makeSureStateReady() {
  const poll = (resolve: (value: unknown) => void) => {
    if (state.isReady()) {
      resolve(true);
    } else {
      console.info('Waiting for State is ready...');
      setTimeout(() => poll(resolve), 400);
    }
  };

  return new Promise(poll);
}

export default function handler<TMessageType extends MessageTypes>(
  { id, message, request }: TransportRequestMessage<TMessageType>,
  port?: Port,
  extensionPortName = PORT_EXTENSION
): void {
  const isExtension = !port || port?.name === extensionPortName;
  const sender = port?.sender as chrome.runtime.MessageSender;
  const from = isExtension ? 'extension' : (sender.tab && sender.tab.url) || sender.url || '<unknown>';
  const source = `${from}: ${id}: ${message}`;

  console.info(` [in] ${source}`); // :: ${JSON.stringify(request)}`);

  if (!port) return;

  const promise = isExtension
    ? extension.handle(id, message, request, port)
    : tabs.handle(id, message, request, from, port);

  promise
    .then((response): void => {
      console.info(`[out] ${source}`); // :: ${JSON.stringify(response)}`);

      // between the start and the end of the promise, the user may have closed
      // the tab, in which case port will be undefined
      assert(port, 'Port has been disconnected');

      port.postMessage({ id, response });
    })
    .then(() => {
      State.signature = null;
    })
    .catch((error: Error): void => {
      console.info(`[err] ${source}:: ${error.message}`);

      // only send message back to port if it's still connected
      if (port) port.postMessage({ error: error.message, id });
    });
}
