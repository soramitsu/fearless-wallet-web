import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Injected } from '@polkadot/extension-inject/types';
import { createSubstrateProvider } from '@/extension/entry/substrateProvider';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

const injected = { accounts: {}, signer: {} } as Injected;
const setup = () => {
  const checkIfPhishing = vi.fn(async () => false);
  const enable = vi.fn(async (_origin: string) => injected);
  const provider = createSubstrateProvider({ version: '4.2.0', checkIfPhishing, enable });
  return { provider, checkIfPhishing, enable };
};

afterEach(() => vi.useRealTimers());

describe('Substrate provider startup and authorization', () => {
  it('connects after a cold worker takes longer than the former three-second timeout', async () => {
    vi.useFakeTimers();
    const { provider, checkIfPhishing, enable } = setup();
    const startup = deferred<boolean>();
    checkIfPhishing.mockReturnValueOnce(startup.promise);

    const connection = provider.enable('Polkaswap');
    const settled = vi.fn();
    void connection.then(settled, settled);
    await vi.advanceTimersByTimeAsync(5000);

    expect(settled).not.toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
    startup.resolve(false);
    await expect(connection).resolves.toBe(injected);
    expect(enable).toHaveBeenCalledExactlyOnceWith('Polkaswap');
  });

  it('retries a rejected worker startup when the dapp connects again', async () => {
    const { provider, checkIfPhishing, enable } = setup();
    checkIfPhishing.mockRejectedValueOnce(new Error('Wallet storage could not be read.'));

    await expect(provider.enable('Polkaswap')).rejects.toThrow('Wallet storage could not be read.');
    expect(enable).not.toHaveBeenCalled();
    await expect(provider.enable('Polkaswap')).resolves.toBe(injected);
    expect(checkIfPhishing).toHaveBeenCalledTimes(2);
    expect(enable).toHaveBeenCalledOnce();
  });

  it('never requests site authorization for a phishing site', async () => {
    const { provider, checkIfPhishing, enable } = setup();
    checkIfPhishing.mockResolvedValue(true);

    await expect(provider.enable('Phishing site')).rejects.toThrow('phishing protection');
    await expect(provider.enable('Phishing site')).rejects.toThrow('phishing protection');
    expect(checkIfPhishing).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
  });

  it('shares one in-flight approval for duplicate connects, then checks authorization again', async () => {
    const { provider, checkIfPhishing, enable } = setup();
    const approval = deferred<Injected>();
    enable.mockReturnValueOnce(approval.promise);

    const first = provider.enable('Polkaswap');
    const second = provider.enable('Polkaswap');
    expect(second).toBe(first);
    await vi.waitFor(() => expect(enable).toHaveBeenCalledOnce());
    approval.resolve(injected);
    await expect(Promise.all([first, second])).resolves.toEqual([injected, injected]);

    await expect(provider.enable('Polkaswap')).resolves.toBe(injected);
    expect(checkIfPhishing).toHaveBeenCalledOnce();
    expect(enable).toHaveBeenCalledTimes(2);
  });

  it('propagates a declined approval to every caller and permits a later retry', async () => {
    const { provider, enable } = setup();
    enable.mockRejectedValueOnce(new Error('User rejected authorization'));

    const first = provider.enable('Polkaswap');
    const second = provider.enable('Polkaswap');
    const results = await Promise.allSettled([first, second]);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') expect(result.reason.message).toBe('User rejected authorization');
    }
    expect(enable).toHaveBeenCalledOnce();
    await expect(provider.enable('Polkaswap')).resolves.toBe(injected);
    expect(enable).toHaveBeenCalledTimes(2);
  });

  it('preserves separate caller labels while sharing the startup check', async () => {
    const { provider, checkIfPhishing, enable } = setup();
    await Promise.all([provider.enable('Polkaswap'), provider.enable('Other dapp')]);
    expect(checkIfPhishing).toHaveBeenCalledOnce();
    expect(enable.mock.calls).toEqual([['Polkaswap'], ['Other dapp']]);
  });
});
