import { assert } from '@polkadot/util';
import { PORT_EXTENSION } from '@extension-base/defaults';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import State from '@extension-base/background/handlers/State';
import type { MessageTypes, Port, TransportRequestMessage } from '@extension-base/background/types/types';
import { IS_EXTENSION } from '@/consts/global';

export const state = new State();
export const extension = new Extension(state);
export const tabs = new Tabs(state);

export function handlers<TMessageType extends MessageTypes>(
  { id, message, request }: TransportRequestMessage<TMessageType>,
  port?: Port
): void {
  const isExtension = !port || port?.name === PORT_EXTENSION;

  if (!port && IS_EXTENSION) return;

  const sender = port?.sender as chrome.runtime.MessageSender;
  const from = isExtension ? 'extension' : (sender.tab && sender.tab.url) || sender.url || '<unknown>';
  // const source = `${from}: ${id}: ${message}: ${
  //   message === 'evm(request)' && request && 'method' in request ? request?.method : ''
  // }`;

  // console.info(`[in] ${source}`);

  const promise = isExtension
    ? extension.handle(id, message, request, port)
    : tabs.handle(id, message, request, from, port);

  promise
    .then((response): void => {
      // console.info(`[out] ${source}`);

      if (IS_EXTENSION) {
        // between the start and the end of the promise, the user may have closed
        // the tab, in which case port will be undefined
        assert(port, 'Port has been disconnected');

        port.postMessage({ id, response });
      } else {
        const channel = new BroadcastChannel('sw-messages');

        channel.postMessage({ id, response });
      }
    })
    .catch((error: Error): void => {
      // console.info(`[err] ${source}:: ${error.message}`);

      // only send message back to port if it's still connected
      if (port && IS_EXTENSION) port.postMessage({ error: error.message, id });
      else {
        const channel = new BroadcastChannel('sw-messages');

        channel.postMessage({ error: error.message, id });
      }
    });
}
