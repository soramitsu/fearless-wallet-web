import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EipService } from '@extension-base/services/eip-service';
import { CRON_GET_API_MAP_STATUS } from '@extension-base/const/intervals';
import type State from '@extension-base/background/handlers/State';

const url = 'https://dapp.example';

function fixture() {
  const getBlock = vi.fn().mockResolvedValue({ number: 1 });
  const suspended = new BehaviorSubject(false);
  const handles = new Map<string, () => void>();
  const sent: unknown[] = [];
  const state = {
    getAuthInfo: vi.fn().mockResolvedValue({ isAllowed: true, evmAuthorizedAccount: '0x1234', currentEvmNetworkKey: 'Ethereum' }),
    keyringService: { currentAccountSubject: new BehaviorSubject(null) },
    requestService: {
      getEvmNetworkInfo: vi.fn().mockReturnValue({ name: 'Ethereum', chainId: 1 }),
      subscribeAuthorizeUrlSubject: new Subject(),
    },
    subscriptionService: {
      createSubscription: () => (data: unknown) => sent.push(data),
      setUnsubscriptionHandle: (id: string, cleanup: () => void) => handles.set(id, cleanup),
      cancelSubscription: (id: string) => handles.get(id)?.(),
    },
    networkService: {
      evmApiHandler: { api: { ethereum: { api: { getBlock, on: vi.fn(), removeListener: vi.fn() } } } },
      suspendedSubject: suspended,
      get suspended() { return suspended.value; },
    },
  };
  const port = { onDisconnect: { addListener: vi.fn() }, postMessage: vi.fn() };
  const service = new EipService(state as unknown as State);
  const subscribe = (id: string) => service.evmSubscribeEvents(url, id, port as unknown as chrome.runtime.Port);
  return { service, subscribe, getBlock, suspended, handles, sent };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// Each check asks the site's node for its latest block. A quiet wallet (WorkerSleepService) asks nothing.
describe("a site's EVM event subscription checking its network", () => {
  it('checks every few seconds while the wallet is connected', async () => {
    const { subscribe, getBlock, sent } = fixture();
    await subscribe('events');

    await vi.advanceTimersByTimeAsync(3 * CRON_GET_API_MAP_STATUS);

    expect(getBlock).toHaveBeenCalledTimes(3);
    expect(sent).toContainEqual({ type: 'connect', payload: { chainId: '0x01' } });
  });

  it('stops checking while the wallet is quiet and starts again when it reconnects', async () => {
    const { subscribe, getBlock, suspended } = fixture();
    await subscribe('first');
    await subscribe('second');
    await vi.advanceTimersByTimeAsync(CRON_GET_API_MAP_STATUS);
    expect(getBlock).toHaveBeenCalledTimes(2);

    suspended.next(true);
    await vi.advanceTimersByTimeAsync(20 * CRON_GET_API_MAP_STATUS);
    expect(getBlock).toHaveBeenCalledTimes(2);

    suspended.next(false);
    await vi.advanceTimersByTimeAsync(CRON_GET_API_MAP_STATUS);
    expect(getBlock).toHaveBeenCalledTimes(4);
  });

  it('starts no check for a subscription made while quiet until the wallet reconnects', async () => {
    const { subscribe, getBlock, suspended } = fixture();
    suspended.next(true);
    await subscribe('events');

    await vi.advanceTimersByTimeAsync(10 * CRON_GET_API_MAP_STATUS);
    expect(getBlock).not.toHaveBeenCalled();

    suspended.next(false);
    await vi.advanceTimersByTimeAsync(CRON_GET_API_MAP_STATUS);
    expect(getBlock).toHaveBeenCalledOnce();
  });

  it('never starts the check of a subscription that ended', async () => {
    const { subscribe, getBlock, suspended, handles } = fixture();
    await subscribe('events');
    handles.get('events')!();

    suspended.next(true);
    suspended.next(false);
    await vi.advanceTimersByTimeAsync(10 * CRON_GET_API_MAP_STATUS);

    expect(getBlock).not.toHaveBeenCalled();
  });
});
