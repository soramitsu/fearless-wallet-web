import type { NetworkJson } from '@extension-base/types';

type ConnectableApi = { isConnected?: boolean };

/** The part of the background state that owns substrate API connections. */
export type SubstrateApiSource = {
  getSubstrateApiMap: Record<string, { api?: unknown } | undefined>;
  networkService: { substrateApiHandler: { initApi: (network: NetworkJson) => unknown } };
};

export const CROSS_CHAIN_RUNTIME_CONNECT_TIMEOUT_MS = 15_000;

const attempts = new Map<string, Promise<unknown>>();

const isConnected = (api: unknown): boolean =>
  typeof api === 'object' && api !== null && (api as ConnectableApi).isConnected !== false;

/**
 * Returns the connected API of a network, creating it only when the network has none.
 *
 * An API that exists but is disconnected is reconnecting by itself (or is being replaced by the network service), so it
 * is waited for, never duplicated: a second ApiPromise would keep its own socket and subscriptions alive. Concurrent
 * callers share one attempt per network.
 */
export function connectedSubstrateApi(
  source: SubstrateApiSource,
  network: NetworkJson,
  { timeoutMs = CROSS_CHAIN_RUNTIME_CONNECT_TIMEOUT_MS }: { timeoutMs?: number } = {}
): Promise<unknown> {
  const key = network.name.toLowerCase();
  const current = source.getSubstrateApiMap[key]?.api;
  if (isConnected(current)) return Promise.resolve(current);

  const pending = attempts.get(key);
  if (pending) return pending;

  const attempt = (async () => {
    if (!source.getSubstrateApiMap[key]?.api) await source.networkService.substrateApiHandler.initApi(network);

    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const api = source.getSubstrateApiMap[key]?.api;
      if (isConnected(api)) return api;
      if (Date.now() >= deadline) throw new Error('cross_chain_runtime_unavailable');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })().finally(() => attempts.delete(key));

  attempts.set(key, attempt);

  return attempt;
}
