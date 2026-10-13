import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
import State from '@extension-base/background/handlers/State';
import Extension from '@extension-base/background/handlers/Extension';

let state: State;
let extension: Extension;
const save = vi.fn(); const favorite = vi.fn(); const publish = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  state = Object.setPrototypeOf({ currentAccount: { address: 'owner-a' },
    networkService: { upsertNetworkMap: save, toggleFavoriteNetwork: favorite }, updateServiceInfo: publish,
    keyringService: { isResetting: false } }, State.prototype);
  extension = new Extension(state);
});

describe('network preference worker commands', () => {
  it('keeps the command pending until persistence acknowledges and then publishes service state', async () => {
    let acknowledge!: () => void; let finished = false;
    save.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const pending = extension.handle('settings', 'pri(networkMap.upsert)', { name: 'Polkadot' } as never).then(() => { finished = true; });
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(finished).toBe(false); expect(publish).not.toHaveBeenCalled();
    acknowledge(); await pending; expect(publish).toHaveBeenCalledOnce();
  });

  it('propagates storage rejection to the UI instead of returning false success', async () => {
    save.mockRejectedValue(new Error('disk full'));
    await expect(extension.handle('settings', 'pri(networkMap.upsert)', { name: 'Polkadot' } as never)).rejects.toThrow('disk full');
    expect(publish).not.toHaveBeenCalled();
  });

  it('rejects a favorite request whose captured wallet is no longer selected', async () => {
    await expect(extension.handle('favorite', 'pri(networkMap.toggle.favorite)', { networkName: 'Polkadot', address: 'owner-b' }))
      .rejects.toThrow('Selected wallet changed');
    expect(favorite).not.toHaveBeenCalled();
  });

  it('captures the requested favorite owner before the selection changes during storage', async () => {
    let acknowledge!: () => void;
    favorite.mockReturnValue(new Promise<void>((resolve) => { acknowledge = resolve; }));
    const pending = extension.handle('favorite', 'pri(networkMap.toggle.favorite)', { networkName: 'Polkadot', address: 'owner-a' });
    await vi.waitFor(() => expect(favorite).toHaveBeenCalledExactlyOnceWith('Polkadot', 'owner-a'));
    Object.defineProperty(state, 'currentAccount', { value: { address: 'owner-b' }, configurable: true });
    acknowledge(); await pending;
    expect(favorite).toHaveBeenCalledOnce();
  });

  it('keeps existing string commands compatible while acknowledging the write', async () => {
    favorite.mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined);
    await expect(extension.handle('favorite', 'pri(networkMap.toggle.favorite)', 'Polkadot')).rejects.toThrow('disk full');
    await extension.handle('favorite', 'pri(networkMap.toggle.favorite)', 'Polkadot');
    expect(favorite).toHaveBeenLastCalledWith('Polkadot', 'owner-a');
  });
});
