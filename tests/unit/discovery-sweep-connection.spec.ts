import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import State from '@extension-base/background/handlers/State';
import { WalletEcosystem } from '@/interfaces';

vi.mock('@subwallet/ui-keyring', () => ({ keyring: {} }));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services', async () => await import('@extension-base/services/asset-discovery-service'));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));
vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn().mockResolvedValue({}), set: vi.fn() } }));
vi.mock('@polkadot/extension-chains', () => ({ addMetadata: vi.fn() }));

function sweep(active: boolean) {
  const polkadot = { name: 'Polkadot', ecosystem: 'substrate', chainId: 'polkadot', active, favorite: [], assets: [] };
  const api = { isReady: Promise.resolve() };
  const handler = {
    api: {} as Record<string, { api?: unknown }>,
    initApi: vi.fn(async (network: { name: string }) => { handler.api[network.name.toLowerCase()] = { api }; }),
    // Like SubstrateApiHandler.destroyApi: the entry stays, its API goes.
    destroyApi: vi.fn(async (name: string) => { delete handler.api[name.toLowerCase()].api; return true; }),
  };
  if (active) handler.api.polkadot = { api };
  const wallets = ['w1', 'w2', 'w3', 'w4', 'w5'].map((address) => ({ address, meta: { walletEcosystem: WalletEcosystem.Substrate } }));
  const fetchBalance = vi.fn().mockResolvedValue([]);
  const state = Object.setPrototypeOf({
    serviceInfoSubject: new Subject(),
    keyringService: { getAllMainAccounts: () => wallets },
    networkService: { networkMap: { Polkadot: polkadot }, substrateApiHandler: handler, evmApiHandler: { api: {} }, tonApiHandler: { api: {} } },
    balanceService: { substrateBalanceService: { fetchBalance } },
  }, State.prototype) as unknown as { scanDiscoveryNetwork(network: unknown): Promise<void> };
  return { state, polkadot, handler, fetchBalance };
}

describe('discovery sweep connections', () => {
  it('connects an inactive Substrate network once and checks every wallet on it', async () => {
    const { state, polkadot, handler, fetchBalance } = sweep(false);

    await state.scanDiscoveryNetwork(polkadot);

    expect(handler.initApi).toHaveBeenCalledOnce();
    expect(fetchBalance.mock.calls.map(([request]) => request.address)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5']);
    expect(handler.destroyApi).toHaveBeenCalledOnce();
    expect(handler.destroyApi.mock.invocationCallOrder[0]).toBeGreaterThan(fetchBalance.mock.invocationCallOrder[4]);
  });

  it('uses and keeps the connection of an active network', async () => {
    const { state, polkadot, handler, fetchBalance } = sweep(true);

    await state.scanDiscoveryNetwork(polkadot);

    expect(handler.initApi).not.toHaveBeenCalled();
    expect(fetchBalance).toHaveBeenCalledTimes(5);
    expect(handler.destroyApi).not.toHaveBeenCalled();
  });

  it('closes the sweep connection when a balance read fails', async () => {
    const { state, polkadot, handler, fetchBalance } = sweep(false);
    fetchBalance.mockRejectedValueOnce(new Error('rpc'));

    await expect(state.scanDiscoveryNetwork(polkadot)).rejects.toThrow('rpc');

    expect(handler.initApi).toHaveBeenCalledOnce();
    expect(handler.destroyApi).toHaveBeenCalledOnce();
  });
});
