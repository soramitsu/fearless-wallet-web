import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvmEvent } from '@extension-base/page/types';

const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@extension-base/page/index', () => ({ sendMessage: transport.send }));

const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetModules();
  transport.send.mockReset().mockResolvedValue([]);
  document.title = 'Example dApp';
});

async function provider() {
  const { FearlessWalletEvmProvider } = await import('@extension-base/page/FearlessWalletEvmProvider');
  return new FearlessWalletEvmProvider();
}

describe('injected EVM requests', () => {
  it('returns an empty account list when the background has no wallet to query', async () => {
    const wallet = await provider();
    // Tabs.handle acknowledges EVM requests without a response when there are no wallet accounts.
    transport.send.mockResolvedValue(undefined);
    await expect(wallet.request({ method: 'eth_accounts' })).resolves.toEqual([]);
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('reads authorized accounts without opening an authorization prompt', async () => {
    const wallet = await provider();
    await expect(wallet.request({ method: 'eth_accounts' })).resolves.toEqual([]);
    expect(transport.send.mock.calls).toEqual([['evm(request)', { method: 'eth_accounts', params: undefined }]]);
  });

  it('enable authorizes first and returns accounts from the background', async () => {
    const wallet = await provider();
    transport.send.mockResolvedValueOnce(true).mockResolvedValueOnce(['0x123']);
    await expect(wallet.enable()).resolves.toEqual(['0x123']);
    expect(transport.send.mock.calls).toEqual([
      ['evm(authorizeUrl)', { method: '', params: { origin: 'Example dApp' } }],
      ['evm(request)', { method: 'eth_accounts', params: undefined }],
    ]);
  });

  it('coalesces concurrent authorization requests and clears the completed attempt', async () => {
    const wallet = await provider();
    const approval = deferred<boolean>();
    transport.send.mockImplementation((message) => message === 'evm(authorizeUrl)' ? approval.promise : Promise.resolve(['0x123']));
    const first = wallet.enable();
    const second = wallet.enable();
    expect(transport.send).toHaveBeenCalledTimes(1);
    approval.resolve(true);
    expect(await Promise.all([first, second])).toEqual([['0x123'], ['0x123']]);
    await wallet.enable();
    expect(transport.send.mock.calls.filter(([message]) => message === 'evm(authorizeUrl)')).toHaveLength(2);
  });

  it('rejects all concurrent callers on denied authorization and allows retry', async () => {
    const wallet = await provider();
    const approval = deferred<boolean>();
    const error = Object.assign(new Error('Rejected'), { code: 4001 });
    transport.send.mockReturnValueOnce(approval.promise);
    const first = wallet.enable();
    const second = wallet.enable();
    const results = Promise.allSettled([first, second]);
    approval.reject(error);
    expect(await results).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
    transport.send.mockResolvedValueOnce(true).mockResolvedValueOnce(['0x456']);
    await expect(wallet.enable()).resolves.toEqual(['0x456']);
  });

  it('does not block an account read behind a pending approval', async () => {
    const wallet = await provider();
    const approval = deferred<boolean>();
    transport.send.mockReturnValueOnce(approval.promise);
    const connecting = wallet.enable();
    await expect(wallet.request({ method: 'eth_accounts' })).resolves.toEqual([]);
    approval.resolve(true);
    await connecting;
  });

  it('forwards RPC parameters without changing them', async () => {
    const wallet = await provider();
    const params = [{ to: '0x123', data: '0xabcdef' }, 'latest'];
    transport.send.mockResolvedValue('0x10');
    await expect(wallet.request({ method: 'eth_call', params })).resolves.toBe('0x10');
    expect(transport.send).toHaveBeenCalledWith('evm(request)', { method: 'eth_call', params });
  });

  it('adds display origin to permissions without mutating caller input', async () => {
    const wallet = await provider();
    const params = Object.freeze({ eth_accounts: {} });
    await wallet.request({ method: 'wallet_requestPermissions', params });
    expect(transport.send).toHaveBeenCalledWith('evm(request)', {
      method: 'wallet_requestPermissions', params: { eth_accounts: {}, origin: 'Example dApp' },
    });
    expect(params).toEqual({ eth_accounts: {} });
  });

  it('falls back to the hostname for an untitled page', async () => {
    document.title = '';
    const wallet = await provider();
    await wallet.enable();
    expect(transport.send.mock.calls[0][1].params.origin).toBe(window.location.hostname);
  });

  it.each([null, undefined, [], {}, { method: '' }, { method: 1 }, { method: 'eth_call', params: null }, { method: 'eth_call', params: 'bad' }])(
    'rejects malformed request %j through its promise without sending it', async (input) => {
      const wallet = await provider();
      await expect(wallet.request(input as never)).rejects.toMatchObject({ code: -32600 });
      expect(transport.send).not.toHaveBeenCalled();
    }
  );
});

describe('legacy callback adapters', () => {
  it('does not replace a changed network with an older in-flight response', async () => {
    const wallet = await provider();
    wallet.on('chainChanged', vi.fn());
    const pending = deferred<string>();
    transport.send.mockReturnValueOnce(pending.promise);
    const request = wallet.request({ method: 'eth_chainId' });
    transport.send.mock.calls[0][2]({ type: 'chainChanged', payload: '0x89' });
    pending.resolve('0x1');
    await request;
    expect(wallet.send({ method: 'net_version', id: 1, jsonrpc: '2.0' })).toHaveProperty('result', '137');
  });

  it('never substitutes the wallet software version for an unknown network', async () => {
    const wallet = await provider();
    expect(() => wallet.send({ method: 'net_version', id: 0, jsonrpc: '2.0' })).toThrow('Network is unknown');
  });

  it('uses the last observed chain for legacy synchronous network queries', async () => {
    const wallet = await provider();
    transport.send.mockResolvedValue('0x20000000000001');
    await wallet.request({ method: 'eth_chainId' });
    expect(wallet.send({ method: 'net_version', id: 0, jsonrpc: '2.0' })).toEqual({ result: '9007199254740993', id: 0, jsonrpc: '2.0' });
    wallet.on('chainChanged', vi.fn());
    const emit = transport.send.mock.calls.find(([message]) => message === 'evm(events.subscribe)')![2];
    emit({ type: 'chainChanged', payload: '0x89' });
    expect(wallet.send({ method: 'net_version', id: 1, jsonrpc: '2.0' })).toHaveProperty('result', '137');
    emit({ type: 'disconnect', payload: {} });
    expect(() => wallet.send({ method: 'net_version', id: 2, jsonrpc: '2.0' })).toThrow('Network is unknown');
  });

  it.each(['send', 'sendAsync'] as const)('%s passes a standard error-first JSON-RPC success envelope', async (method) => {
    const wallet = await provider();
    const callback = vi.fn();
    transport.send.mockResolvedValue('0x1');
    wallet[method]({ method: 'eth_chainId', params: [], id: 0, jsonrpc: '2.0' }, callback);
    await tick();
    expect(callback.mock.calls).toEqual([[null, { result: '0x1', id: 0, jsonrpc: '2.0' }]]);
  });

  it.each(['send', 'sendAsync'] as const)('%s delivers an RPC rejection exactly once', async (method) => {
    const wallet = await provider();
    const callback = vi.fn();
    const failure = Object.assign(new Error('RPC rejected'), { code: 4001 });
    transport.send.mockRejectedValue(failure);
    // Catch a legacy returned promise too so the regression does not create a test-runner unhandled rejection.
    await Promise.resolve(wallet[method]({ method: 'eth_chainId', id: 'request-1', jsonrpc: '2.0' }, callback)).catch(() => undefined);
    await tick();
    expect(callback.mock.calls).toEqual([[failure]]);
  });
});

describe('event subscriptions', () => {
  it('retries a pre-authorization subscription that rejects after authorization completes', async () => {
    const wallet = await provider();
    const subscription = deferred<boolean>();
    transport.send.mockReturnValueOnce(subscription.promise);
    const changed = vi.fn();
    wallet.on('accountsChanged', changed);
    transport.send.mockResolvedValueOnce(true).mockResolvedValueOnce(['approved']);
    await wallet.enable();
    subscription.reject(new Error('Earlier authorization snapshot was denied'));
    await tick();
    const subscriptions = transport.send.mock.calls.filter(([message]) => message === 'evm(events.subscribe)');
    expect(subscriptions).toHaveLength(2);
    subscriptions[1][2]({ type: 'accountsChanged', payload: ['latest'] });
    expect(changed).toHaveBeenCalledExactlyOnceWith(['latest']);
  });

  it('delivers events independently to multiple provider instances', async () => {
    const first = await provider();
    const second = await provider();
    const one = vi.fn();
    const two = vi.fn();
    first.on('accountsChanged', one);
    second.on('accountsChanged', two);
    expect(transport.send).toHaveBeenCalledTimes(2);
    transport.send.mock.calls[0][2]({ type: 'accountsChanged', payload: ['one'] });
    transport.send.mock.calls[1][2]({ type: 'accountsChanged', payload: ['two'] });
    expect(one.mock.calls).toEqual([[['one']]]);
    expect(two.mock.calls).toEqual([[['two']]]);
  });

  it('subscribes only once while registration is pending', async () => {
    const wallet = await provider();
    transport.send.mockReturnValue(new Promise(() => {}));
    wallet.on('chainChanged', vi.fn());
    wallet.once('accountsChanged', vi.fn());
    wallet.on('disconnect', vi.fn());
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('retries a failed subscription on later listener registration', async () => {
    const wallet = await provider();
    transport.send.mockRejectedValueOnce(new Error('not authorized'));
    wallet.on('chainChanged', vi.fn());
    await tick();
    wallet.on('accountsChanged', vi.fn());
    expect(transport.send).toHaveBeenCalledTimes(2);
  });

  it('restores existing listeners after authorization succeeds', async () => {
    const wallet = await provider();
    const changed = vi.fn();
    transport.send.mockRejectedValueOnce(new Error('not authorized'));
    wallet.on('accountsChanged', changed);
    await tick();
    transport.send.mockResolvedValueOnce(true).mockResolvedValueOnce(true).mockResolvedValueOnce(['approved']);
    await wallet.enable();
    const subscriptions = transport.send.mock.calls.filter(([message]) => message === 'evm(events.subscribe)');
    expect(subscriptions).toHaveLength(2);
    subscriptions[1][2]({ type: 'accountsChanged', payload: ['changed'] });
    expect(changed).toHaveBeenCalledWith(['changed']);
  });

  it('restores existing listeners after a permissions request succeeds', async () => {
    const wallet = await provider();
    transport.send.mockRejectedValueOnce(new Error('not authorized'));
    wallet.on('chainChanged', vi.fn());
    await tick();
    await wallet.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    expect(transport.send.mock.calls.filter(([message]) => message === 'evm(events.subscribe)')).toHaveLength(2);
  });

  it('addListener starts delivery and once removes its listener after one event', async () => {
    const wallet = await provider();
    const changed = vi.fn();
    const once = vi.fn();
    wallet.addListener('chainChanged', changed);
    expect(transport.send).toHaveBeenCalledTimes(1);
    wallet.once('chainChanged', once);
    const emit = transport.send.mock.calls[0][2];
    emit({ type: 'chainChanged', payload: '0x1' });
    emit({ type: 'chainChanged', payload: '0x2' });
    expect(changed).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledExactlyOnceWith('0x1');
  });

  it('registers its listener before a synchronously delivered initial event', async () => {
    const wallet = await provider();
    transport.send.mockImplementation((_message, _request, callback) => {
      callback({ type: 'connect', payload: { chainId: '0x1' } });
      return Promise.resolve(true);
    });
    const connected = vi.fn();
    wallet.on('connect', connected);
    expect(connected).toHaveBeenCalledExactlyOnceWith({ chainId: '0x1' });
  });

  it('updates connection state before listeners run and normalizes data events', async () => {
    const wallet = await provider();
    const states: boolean[] = [];
    const message = vi.fn();
    wallet.on('disconnect', () => states.push(wallet.isConnected()));
    wallet.on('connect', () => states.push(wallet.connected));
    wallet.on('message', message);
    const emit = transport.send.mock.calls[0][2] as (event: EvmEvent) => void;
    emit({ type: 'disconnect', payload: {} });
    emit({ type: 'connect', payload: { chainId: '0x1' } });
    emit({ type: 'data', payload: { result: 'hello' } });
    expect(states).toEqual([false, true]);
    expect(message).toHaveBeenCalledExactlyOnceWith({ result: 'hello' });
  });
});
