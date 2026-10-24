import { afterEach, describe, expect, it, vi } from 'vitest';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import WalletConnectStorage from '@extension-base/services/wallet-connect-service/storage';

vi.mock('@/consts/global', async (original) => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: false }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: undefined }));

afterEach(async () => {
  await BaseWebStore.flush().catch(() => {});
  vi.restoreAllMocks();
});

describe('WalletConnect storage in the web worker', () => {
  it('reads its persisted session through IndexedDB without extension APIs', async () => {
    const get = vi.spyOn(BaseWebStore.prototype, 'getByKey').mockResolvedValue({ topic: 'public-session' });
    await expect(new WalletConnectStorage().getItem('session')).resolves.toEqual({ topic: 'public-session' });
    expect(get).toHaveBeenCalledWith('fwWalletConnectSdk:session');
  });
  it.each(['getKeys', 'getEntries'] as const)('enumerates %s without exposing wallet-key records to the SDK', async (method) => {
    vi.spyOn(BaseWebStore.prototype, 'getAllItemsWithKeys').mockResolvedValue([
      { key: 'fw:account:public-key', value: { encoded: 'public-fixture-ciphertext' } },
      { key: 'fwWalletConnectSdk:session', value: { topic: 'public-session' } },
    ]);
    await expect(new WalletConnectStorage()[method]()).resolves.toEqual(
      method === 'getKeys' ? ['session'] : [['session', { topic: 'public-session' }]]
    );
  });
  it.each(['setItem', 'removeItem'] as const)('waits for the real IndexedDB %s transaction and rejects aborts', async (method) => {
    const put = vi.fn();
    const remove = vi.fn();
    const tx = { oncomplete: undefined as (() => void) | undefined, onabort: undefined as (() => void) | undefined,
      error: new Error('Public quota failure'), objectStore: () => ({ put, delete: remove }) };
    vi.spyOn(BaseWebStore.prototype, 'openDatabase').mockResolvedValue({ transaction: () => tx } as unknown as IDBDatabase);
    let settled = false;
    const result = new WalletConnectStorage()[method]('session', { topic: 'public-session' })
      .then(() => { settled = true; return 'resolved'; }, () => { settled = true; return 'rejected'; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const wasSettled = settled;
    tx.onabort?.();
    expect(await result).toBe('rejected');
    expect(wasSettled).toBe(false);
    if (method === 'setItem') expect(put).toHaveBeenCalledWith({ topic: 'public-session' }, 'fwWalletConnectSdk:session');
    else expect(remove).toHaveBeenCalledWith('fwWalletConnectSdk:session');
  });
});
