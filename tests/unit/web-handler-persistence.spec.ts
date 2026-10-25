import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ handle: vi.fn(), accountsFlush: vi.fn(), passwordFlush: vi.fn(), readOnly: false }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION: false }));
vi.mock('@extension-base/stores/BaseWeb', () => ({ default: { flush: mocks.accountsFlush } }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: {
  flush: mocks.passwordFlush, get readOnly() { return mocks.readOnly; },
  assertWritable: () => { if (mocks.readOnly) throw new Error('Wallet storage needs repair.'); },
} }));
vi.mock('@extension-base/background/handlers/Extension', () => ({ default: class { handle = mocks.handle; } }));
vi.mock('@extension-base/background/handlers/Tabs', () => ({ default: class { handle = mocks.handle; } }));
vi.mock('@extension-base/background/handlers/State', () => ({ default: class {} }));

import { handlers } from '@extension-base/background/handlers';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('web handler persistence boundary', () => {
  const postMessage = vi.fn();
  const close = vi.fn();
  const request = { id: 'fixture', message: 'pri(accounts.list)', request: undefined } as Parameters<typeof handlers>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readOnly = false;
    mocks.handle.mockResolvedValue('completed');
    mocks.accountsFlush.mockResolvedValue(undefined);
    mocks.passwordFlush.mockResolvedValue(undefined);
    vi.stubGlobal('BroadcastChannel', class { postMessage = postMessage; close = close; });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['pri(keyring.changePassword)', 'pri(keyring.reset)', 'pri(accounts.create)', 'pri(accounts.deleted.restore)',
    'pri(accounts.makeTransfer)', 'pri(signing.approve)', 'pri(authorize.approve)'])(
    'denies %s before the handler while password storage needs repair', async (message) => {
      mocks.readOnly = true;
      await handlers({ ...request, message } as Parameters<typeof handlers>[0]);
      expect(mocks.handle).not.toHaveBeenCalled();
      expect(postMessage).toHaveBeenCalledExactlyOnceWith({ id: 'fixture', error: 'Wallet storage needs repair.' });
    });

  it.each(['pri(accounts.subscribe)', 'pri(keyring.unlock)', 'pri(keyring.export.mnemonic)', 'pri(accounts.export.json)'])(
    'admits recovery request %s while password storage needs repair', async (message) => {
      mocks.readOnly = true;
      await handlers({ ...request, message } as Parameters<typeof handlers>[0]);
      expect(mocks.handle).toHaveBeenCalledOnce();
      expect(postMessage).toHaveBeenCalledExactlyOnceWith({ id: 'fixture', response: 'completed' });
    });

  it('replies only after account and password storage have both settled', async () => {
    const accounts = deferred();
    const password = deferred();
    mocks.accountsFlush.mockReturnValue(accounts.promise);
    mocks.passwordFlush.mockReturnValue(password.promise);
    const pending = handlers(request);
    await vi.waitFor(() => expect(mocks.accountsFlush).toHaveBeenCalledOnce());
    accounts.resolve();
    await Promise.resolve();
    expect(postMessage).not.toHaveBeenCalled();
    password.resolve();
    await pending;
    expect(postMessage).toHaveBeenCalledWith({ id: 'fixture', response: 'completed' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('waits for queued persistence even when the handler itself fails', async () => {
    const accounts = deferred();
    mocks.handle.mockRejectedValue(new Error('operation failed'));
    mocks.accountsFlush.mockReturnValue(accounts.promise);
    const pending = handlers(request);
    await vi.waitFor(() => expect(mocks.accountsFlush).toHaveBeenCalledOnce());
    expect(postMessage).not.toHaveBeenCalled();
    accounts.resolve();
    await pending;
    expect(postMessage).toHaveBeenCalledWith({ id: 'fixture', error: 'operation failed' });
  });

  it('reports account persistence failure after the other store finishes, without a success response', async () => {
    const accounts = deferred();
    const password = deferred();
    mocks.accountsFlush.mockReturnValue(accounts.promise);
    mocks.passwordFlush.mockReturnValue(password.promise);
    const pending = handlers(request);
    await vi.waitFor(() => expect(mocks.accountsFlush).toHaveBeenCalledOnce());
    accounts.reject(new Error('account commit failed'));
    await Promise.resolve();
    expect(postMessage).not.toHaveBeenCalled();
    password.resolve();
    await pending;
    expect(postMessage).toHaveBeenCalledExactlyOnceWith({ id: 'fixture', error: 'account commit failed' });
  });
});
