const { connect, port } = vi.hoisted(() => {
  const listeners = {
    disconnect: [] as Array<() => void>,
    message: [] as Array<(data: unknown) => void>,
  };
  const port = {
    listeners,
    postMessage: vi.fn(),
    onDisconnect: { addListener: (listener: () => void) => listeners.disconnect.push(listener) },
    onMessage: { addListener: (listener: (data: unknown) => void) => listeners.message.push(listener) },
  };

  return { connect: vi.fn(() => port), port };
});

vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { connect } } }));

import { sendMessage } from '@/extension/messaging';
import { watchWalletLock } from '@/bootstrap/walletLock';

const send = sendMessage as unknown as (message: string, request?: unknown, subscriber?: unknown) => Promise<unknown>;
const lastRequestId = () => (port.postMessage.mock.lastCall?.[0] as { id: string }).id;
const disconnect = () => port.listeners.disconnect.at(-1)?.();
const reply = (data: unknown) => port.listeners.message.at(-1)?.(data);

describe('extension messaging', () => {
  it('fails a request when its background goes away, instead of leaving it pending forever', async () => {
    const request = send('pri(accounts.checkTransfer)', { networkKey: 'Ethereum' });

    disconnect();

    await expect(request).rejects.toThrow('Wallet background disconnected');
    // The popup connects again for the requests that follow.
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('answers a request sent over the new connection', async () => {
    const request = send('pri(accounts.checkTransfer)', { networkKey: 'Ethereum' });

    reply({ id: lastRequestId(), response: { estimateFee: '0.0000021' } });

    await expect(request).resolves.toEqual({ estimateFee: '0.0000021' });
  });

  it('leaves a subscription to the code that manages it', async () => {
    const settled = vi.fn();

    void send('pri(balance.subscribe)', {}, vi.fn()).then(settled, settled);
    disconnect();
    await Promise.resolve();

    expect(settled).not.toHaveBeenCalled();
  });

  it('discards an open wallet after its acknowledged lock subscription loses the worker', async () => {
    const discardView = vi.fn();
    const stop = watchWalletLock(discardView);
    const subscriptionId = lastRequestId();
    reply({ id: subscriptionId, response: false });
    await Promise.resolve();
    expect(discardView).not.toHaveBeenCalled();

    disconnect();
    expect(discardView).toHaveBeenCalledOnce();
    // A reconnect or late lock notification must not initiate another reload.
    disconnect();
    reply({ id: subscriptionId, subscription: true });
    expect(discardView).toHaveBeenCalledOnce();
    stop();
  });

  it('does not reload repeatedly when a worker never answers its initial connection', () => {
    disconnect();
    const discardView = vi.fn();
    const stop = watchWalletLock(discardView);
    disconnect();
    disconnect();
    expect(discardView).not.toHaveBeenCalled();
    stop();
  });

  it('stops observing worker disconnects when the wallet watcher unmounts', () => {
    const discardView = vi.fn();
    const stop = watchWalletLock(discardView);
    reply({ id: lastRequestId(), response: true });
    stop();
    disconnect();
    expect(discardView).not.toHaveBeenCalled();
  });
});
