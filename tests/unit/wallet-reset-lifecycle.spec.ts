import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
import Extension from '@extension-base/background/handlers/Extension';
import type State from '@extension-base/background/handlers/State';

let order: string[];
let extension: Extension;
let requests: ReturnType<typeof vi.fn>;
let incoming: ReturnType<typeof vi.fn>;
let mobile: ReturnType<typeof vi.fn>;
let clear: ReturnType<typeof vi.fn>;
let keyring: { isResetting: boolean; getPassword: ReturnType<typeof vi.fn>; exportAccountMnemonic: ReturnType<typeof vi.fn> };
beforeEach(() => {
  order = [];
  requests = vi.fn(async () => { order.push('requests'); });
  mobile = vi.fn(async () => { order.push('mobile'); });
  incoming = vi.fn(async () => { order.push('incoming'); });
  clear = vi.fn(async () => { order.push('selection'); });
  keyring = { isResetting: false, getPassword: vi.fn(() => 'Public fixture password'),
    exportAccountMnemonic: vi.fn(async () => ({ seed: 'Public fixture phrase' })) };
  extension = new Extension({
    requestService: { resetWallet: requests }, walletConnectService: { resetWallet: incoming },
    walletConnectDappService: { resetWallet: mobile }, setCurrentAccount: clear,
    keyringService: { ...keyring, resetWallet: async (before?: () => Promise<void>) => {
      try { await before?.(); order.push('archive-and-remove'); return true; } catch { return false; }
    } },
  } as unknown as State);
});
const reset = () => extension.handle('public-reset', 'pri(keyring.reset)', null);

describe('reset handler lifecycle prerequisites', () => {
  it('retires requests and both session roles, then clears State before removing keys', async () => {
    expect(await reset()).toBe(true);
    expect(order).toEqual(['requests', 'mobile', 'incoming', 'selection', 'archive-and-remove']);
    expect(clear).toHaveBeenCalledExactlyOnceWith(null);
  });
  it.each(['requests', 'mobile', 'incoming', 'selection'] as const)('does not remove keys if %s acknowledgement fails', async (step) => {
    ({ requests, mobile, incoming, selection: clear })[step].mockRejectedValueOnce(new Error('Public storage failure'));
    expect(await reset()).toBe(false);
    expect(order).not.toContain('archive-and-remove');
    expect(await reset()).toBe(true);
    expect(order.at(-1)).toBe('archive-and-remove');
  });
  it('keeps the reset request pending until durable revocation completes', async () => {
    let finish!: () => void;
    requests.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    let settled = false;
    const pending = reset().then((value) => { settled = true; return value; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const before = [...order];
    const wasSettled = settled;
    finish?.();
    await pending;
    expect(wasSettled).toBe(false);
    expect(before).not.toContain('archive-and-remove');
  });
  it.each(['pri(keyring.getPassword)', 'pri(keyring.export.mnemonic)'] as const)(
    'does not admit %s while reset still retains live keys for failure recovery', async (type) => {
      Object.assign(extension.state.keyringService, { isResetting: true });
      await expect(extension.handle('public-during-reset', type, { address: 'public-fixture' } as never))
        .rejects.toThrow('Wallet reset is in progress');
      expect(keyring.getPassword).not.toHaveBeenCalled();
      expect(keyring.exportAccountMnemonic).not.toHaveBeenCalled();
      expect(await extension.handle('public-ping', 'pri(app.port.ping)', null)).toBe(true);
    }
  );
});
