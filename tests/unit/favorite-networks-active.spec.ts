import { describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { FAVORITE_NETWORKS } from '@/consts/networks';

vi.mock('@extension-base/stores/NetworkMap', () => ({ default: class {
  get() {}
  getAndWait() { return Promise.resolve(undefined); }
  getSubject() { return { next() {} }; }
  updateAndWait() { return Promise.resolve(); }
} }));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({ default: class {
  get(_key: string, update: (value: unknown) => void) { update({}); }
  getAndWait() { return Promise.resolve({}); }
  set() {}
} }));

const network = (name: string, favorite: string[], ecosystem = 'substrate'): NetworkJson => ({
  name, key: name, chainId: name.toLowerCase(), ecosystem, active: true, favorite,
  assets: [], nodes: [{ name: 'node', url: `wss://${name.toLowerCase()}.invalid` }],
} as unknown as NetworkJson);

function create(accounts: Array<{ address: string; meta: { walletEcosystem: WalletEcosystem } }>) {
  const service = new NetworkService({ getAllMainAccounts: () => accounts } as never, {} as never);
  service.networkMap.Polkadot = network('Polkadot', ['alice']);
  service.networkMap.Kusama = network('Kusama', ['bob']);
  service.networkMap['Ton Mainnet'] = network('Ton Mainnet', ['ton-wallet'], 'ton');
  return service;
}

describe('the "Favorites" network selection', () => {
  it('connects the wallet\'s favourite networks and none of the others', () => {
    const service = create([{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }]);
    service.selectedNetworks = { alice: FAVORITE_NETWORKS };

    expect(service.getActiveNetworks().map(({ name }) => name)).toEqual(['Polkadot']);
  });

  it('connects nothing for a wallet without favourites, and only networks of its ecosystem', () => {
    const service = create([
      { address: 'carol', meta: { walletEcosystem: WalletEcosystem.Substrate } },
      { address: 'ton-wallet', meta: { walletEcosystem: WalletEcosystem.Ton } },
    ]);
    service.selectedNetworks = { carol: FAVORITE_NETWORKS, 'ton-wallet': FAVORITE_NETWORKS };

    expect(service.getActiveNetworks().map(({ name }) => name)).toEqual(['Ton Mainnet']);
  });
});
