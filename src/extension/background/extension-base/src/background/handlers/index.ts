// import { assert } from '@polkadot/util';
// import { PORT_EXTENSION } from '@extension-base/defaults';
import Extension from '@extension-base/background/handlers/Extension';
import Tabs from '@extension-base/background/handlers/Tabs';
import State from '@extension-base/background/handlers/State';
import type { MessageTypes, Port, TransportRequestMessage } from '@extension-base/background/types/types';

export const state = new State();
export const extension = new Extension(state);
export const tabs = new Tabs(state);

export function handlers<TMessageType extends MessageTypes>(
  { id, message, request }: TransportRequestMessage<TMessageType>,
  port?: Port
): void {
  // const isExtension = !port || port?.name === extensionPortName;
  // const isExtension = false;
  // if (!port) return;

  // const sender = port?.sender as chrome.runtime.MessageSender;
  // const from = isExtension ? 'extension' : (sender.tab && sender.tab.url) || sender.url || '<unknown>';
  const from = 'extension';
  const source = `${from}: ${id}: ${message}`;

  console.info(`[in] ${source}`);

  // port service worker id/name
  const promise = extension.handle(id, message, request);

  promise
    .then((response): void => {
      console.info(`[out] ${source}`);

      // between the start and the end of the promise, the user may have closed
      // the tab, in which case port will be undefined
      // assert(port, 'Port has been disconnected');

      // port.postMessage({ id, response });

      //TODO: Stefan: тут посылаем сообщение обратно на клиент
      const channel = new BroadcastChannel('sw-messages');
      channel.postMessage({ id, response });
    })
    .catch((error: Error): void => {
      console.info(`[err] ${source}:: ${error.message}`);

      // only send message back to port if it's still connected
      if (port) port.postMessage({ error: error.message, id });
    });
}
