import type { NetworkJson } from '@extension-base/types';
import { connectedSubstrateApi, type SubstrateApiSource } from '@/cross-chain/runtimeConnection';

const network = (name: string) => ({ name }) as NetworkJson;

function source(apis: Record<string, { api?: unknown } | undefined> = {}) {
  const initApi = vi.fn((target: NetworkJson) => {
    apis[target.name.toLowerCase()] = { api: { isConnected: false, id: initApi.mock.calls.length } };
  });

  return { initApi, apis, source: { getSubstrateApiMap: apis, networkService: { substrateApiHandler: { initApi } } } satisfies SubstrateApiSource };
}

describe('cross-chain runtime connection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a connected API without touching the connection', async () => {
    const api = { isConnected: true };
    const { initApi, source: state } = source({ polkadot: { api } });

    await expect(connectedSubstrateApi(state, network('Polkadot'))).resolves.toBe(api);
    expect(initApi).not.toHaveBeenCalled();
  });

  it('creates the API of a network that has none once, even for concurrent callers', async () => {
    vi.useFakeTimers();
    const { initApi, apis, source: state } = source();

    const first = connectedSubstrateApi(state, network('Kusama'));
    const second = connectedSubstrateApi(state, network('Kusama'));
    await vi.advanceTimersByTimeAsync(300);
    (apis.kusama!.api as { isConnected: boolean }).isConnected = true;
    await vi.advanceTimersByTimeAsync(100);

    await expect(first).resolves.toBe(apis.kusama!.api);
    await expect(second).resolves.toBe(apis.kusama!.api);
    expect(initApi).toHaveBeenCalledOnce();
  });

  it('waits for a disconnected API to reconnect instead of creating a second one', async () => {
    vi.useFakeTimers();
    const api = { isConnected: false };
    const { initApi, source: state } = source({ astar: { api } });

    const connected = connectedSubstrateApi(state, network('Astar'));
    await vi.advanceTimersByTimeAsync(2_000);
    api.isConnected = true;
    await vi.advanceTimersByTimeAsync(100);

    await expect(connected).resolves.toBe(api);
    expect(initApi).not.toHaveBeenCalled();
  });

  it('gives up after the timeout without replacing the API, and lets a later call try again', async () => {
    vi.useFakeTimers();
    const api = { isConnected: false };
    const { initApi, source: state } = source({ acala: { api } });

    const failed = connectedSubstrateApi(state, network('Acala'), { timeoutMs: 1_000 });
    const assertion = expect(failed).rejects.toThrow('cross_chain_runtime_unavailable');
    await vi.advanceTimersByTimeAsync(1_100);
    await assertion;
    expect(initApi).not.toHaveBeenCalled();
    expect(state.getSubstrateApiMap.acala?.api).toBe(api);

    api.isConnected = true;
    await expect(connectedSubstrateApi(state, network('Acala'))).resolves.toBe(api);
  });

  it('waits for an API that the network service creates only once it connects', async () => {
    vi.useFakeTimers();
    const apis: Record<string, { api?: unknown } | undefined> = {};
    const initApi = vi.fn(() => {
      apis.sora = {};
    });
    const state = { getSubstrateApiMap: apis, networkService: { substrateApiHandler: { initApi } } };

    const connected = connectedSubstrateApi(state, network('SORA'));
    const again = connectedSubstrateApi(state, network('SORA'));
    await vi.advanceTimersByTimeAsync(500);
    const api = { isConnected: true };
    apis.sora = { api };
    await vi.advanceTimersByTimeAsync(100);

    await expect(connected).resolves.toBe(api);
    await expect(again).resolves.toBe(api);
    expect(initApi).toHaveBeenCalledOnce();
  });
});
