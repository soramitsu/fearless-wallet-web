import { describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import { NetworkService } from '@extension-base/services/network-service';
import { storage } from '@extension-base/stores/Storage';

const store = vi.hoisted(() => ({
  read: undefined as undefined | (() => Promise<unknown>),
  set: vi.fn(),
}));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  // A failed read never calls back (BaseExtension.get).
  get() {}
  getAndWait() { return store.read!(); }
  set = store.set;
} }));
vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get() {}
  getAndWait() { return Promise.resolve(undefined); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: vi.fn() }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const create = () => new NetworkService({ getAllMainAccounts: () => [] } as never, {} as never);

describe('saved network selections', () => {
  it('are not replaced when they could not be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    store.set.mockClear();
    store.read = () => Promise.reject(new Error('storage unavailable'));
    const service = create();
    await settle();

    service.selectedNetworks.alice = 'popular';
    service.saveSelectedNetworks();

    expect(store.set).not.toHaveBeenCalled();
  });

  it('are read strictly and kept over the defaults filled in meanwhile', async () => {
    store.set.mockClear();
    store.read = () => Promise.resolve({ alice: 'favorites', bob: 'Kusama' });
    const service = create();
    service.selectedNetworks.carol = 'all';
    await settle();

    expect(service.selectedNetworks).toEqual({ carol: 'all', alice: 'favorites', bob: 'Kusama' });
    service.saveSelectedNetworks();
    expect(store.set).toHaveBeenCalledExactlyOnceWith('selectedNetworks', { carol: 'all', alice: 'favorites', bob: 'Kusama' });
  });

  it('are saved through the same guard when a wallet is removed', () => {
    const saveSelectedNetworks = vi.fn();
    const state = Object.setPrototypeOf({
      networkService: { selectedNetworks: { alice: 'all', bob: 'popular' }, saveSelectedNetworks },
      nftService: { deleteSavedNfts: vi.fn() },
      balanceService: { deleteBalance: vi.fn() },
    }, State.prototype) as State;

    state.cleanupDeletedAccount('alice');

    expect(state.networkService.selectedNetworks).toEqual({ bob: 'popular' });
    expect(saveSelectedNetworks).toHaveBeenCalledOnce();
    expect(storage.set).not.toHaveBeenCalled();
  });
});
