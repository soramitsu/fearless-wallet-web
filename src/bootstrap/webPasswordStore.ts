// Read the historical record for migration. All new password writes and reset
// tombstones live with account records in IndexedDB; legacy bytes remain intact.
const channelName = 'fearless.web.password-store';
const storageKey = 'fw:keyring';
let installed = false;

type Operation = 'get';
type BridgeOperation = Operation | 'ready';
export function installWebPasswordStorage(): void {
  if (installed) return;
  installed = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.channel !== channelName || !event.ports[0]) return;
    const worker = event.source as ServiceWorker | null;
    const expected = new URL(
      import.meta.env.DEV ? '/src/extension/entry/background-web.ts' : './service-worker.js',
      location.href
    );
    if (worker?.scriptURL !== expected.href) return;
    const port = event.ports[0];
    try {
      const operation: BridgeOperation = event.data.operation;
      let value: string | null = null;
      if (operation === 'ready') value = channelName;
      else if (operation === 'get') value = localStorage.getItem(storageKey);
      else throw new Error('Unsupported storage operation');
      port.postMessage({ value });
    } catch {
      port.postMessage({ error: 'Wallet storage is unavailable.' });
    } finally {
      port.close();
    }
  });
}

export async function requestWebPasswordStorage(operation: Operation): Promise<string | null> {
  type WalletWindow = { url: string; focused: boolean; postMessage: (data: unknown, ports: MessagePort[]) => void };
  const scope = globalThis as unknown as {
    clients: {
      matchAll: (options: {
        type: string;
        includeUncontrolled: boolean;
      }) => Promise<WalletWindow[]>;
    };
  };
  const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!windows.length) throw new Error('Open the wallet to access its storage.');
  const deadline = Date.now() + 20000;
  const send = (client: WalletWindow, action: BridgeOperation, timeout: number, signal?: AbortSignal) =>
    new Promise<string | null>((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timer);
      channel.port1.close();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => { finish(); reject(new Error('Wallet storage discovery finished.')); };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Wallet storage timed out.'));
    }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    channel.port1.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.value);
    };
    try {
      client.postMessage({ channel: channelName, operation: action }, [channel.port2]);
    } catch (error) {
      finish();
      reject(error);
    }
  });
  // A focused same-origin page may not be a wallet. Discover a live listener.
  const discovery = new AbortController();
  let client: WalletWindow;
  try {
    client = await Promise.any(windows.map(async (window) => {
      const reply = await send(window, 'ready', 2000, discovery.signal);
      if (reply !== channelName) throw new Error('Wallet storage bridge unavailable.');
      return window;
    }));
  } catch {
    throw new Error('Open the wallet to access its storage.');
  } finally {
    discovery.abort();
  }
  return send(client, operation, Math.max(1, deadline - Date.now()));
}
