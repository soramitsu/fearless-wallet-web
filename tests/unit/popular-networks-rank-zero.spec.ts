import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { NetworkService } from '@extension-base/services/network-service';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { POPULAR_NETWORKS } from '@/consts/networks';
import { isPopularNetwork, matchesNetworkSelection } from '@/helpers/networkSelection';

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

const network = (name: string, rank?: number): NetworkJson => ({
  name, key: name, chainId: name.toLowerCase(), ecosystem: 'substrate', active: false, favorite: [], rank,
  assets: [], nodes: [{ name: 'node', url: `wss://${name.toLowerCase().replace(/ /g, '-')}.invalid` }],
} as unknown as NetworkJson);

describe('the "Popular" network selection', () => {
  it('connects SORA Mainnet, which the registry ranks 0, so Polkaswap has its runtime', () => {
    const service = new NetworkService({
      getAllMainAccounts: () => [{ address: 'alice', meta: { walletEcosystem: WalletEcosystem.Substrate } }],
    } as never, {} as never);
    service.networkMap['SORA Mainnet'] = network('SORA Mainnet', 0);
    service.networkMap.Polkadot = network('Polkadot', 8);
    service.networkMap.Unranked = network('Unranked');
    service.selectedNetworks = { alice: POPULAR_NETWORKS };

    expect(service.getActiveNetworks().map(({ name }) => name)).toEqual(['SORA Mainnet', 'Polkadot']);
  });

  it('counts rank 0 as popular and a missing rank as not', () => {
    expect(isPopularNetwork(network('SORA Mainnet', 0))).toBe(true);
    expect(isPopularNetwork(network('Polkadot', 8))).toBe(true);
    expect(isPopularNetwork(network('Unranked'))).toBe(false);
    expect(isPopularNetwork(undefined)).toBe(false);
    expect(matchesNetworkSelection(network('SORA Mainnet', 0), POPULAR_NETWORKS)).toBe(true);
  });

  it('includes SORA Mainnet from the bundled production registry', () => {
    const registry = JSON.parse(
      readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8')
    ) as NetworkJson[];
    const sora = registry.find(({ name }) => name === 'SORA Mainnet');

    expect(sora?.rank).toBe(0);
    expect(isPopularNetwork(sora)).toBe(true);
  });
});
