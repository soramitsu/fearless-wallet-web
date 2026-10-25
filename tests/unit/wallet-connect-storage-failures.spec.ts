import { beforeEach, expect, it, vi } from 'vitest';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';
const local = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { storage: { local } } }));
beforeEach(() => vi.resetAllMocks());
it.each(['getKeys', 'getEntries', 'getItem'] as const)(
  'propagates %s rejection and allows a subsequent retry',
  async (method) => {
    const store = new WalletConnectStorage();
    local.get
      .mockRejectedValueOnce(new Error('Public storage unavailable'))
      .mockResolvedValue({ 'public-session': { topic: 'public-topic' } });
    const result = await Promise.race([
      store[method]('public-session').then(
        () => 'resolved',
        () => 'rejected'
      ),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 100)),
    ]);
    expect(result).toBe('rejected');
    await expect(store[method]('public-session')).resolves.toEqual(
      method === 'getKeys'
        ? ['public-session']
        : method === 'getEntries'
          ? [['public-session', { topic: 'public-topic' }]]
          : { topic: 'public-topic' }
    );
  }
);
it.each(['setItem', 'removeItem'] as const)(
  'does not acknowledge %s before persistence and propagates its failure',
  async (method) => {
    let fail!: (error: Error) => void;
    const operation = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    local[method === 'setItem' ? 'set' : 'remove'].mockReturnValue(operation);
    let done = false;
    const result = new WalletConnectStorage()[method]('public-session', {}).then(
      () => {
        done = true;
        return 'resolved';
      },
      () => {
        done = true;
        return 'rejected';
      }
    );
    await Promise.resolve();
    expect(done).toBe(false);
    fail(new Error('Public quota exceeded'));
    expect(await result).toBe('rejected');
  }
);
