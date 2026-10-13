import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import BalanceService from '@extension-base/services/balance-service';
import { NetworkService } from '@extension-base/services/network-service';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSnapshot } from '../fixtures/legacy-305/generate';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';
import { createAssetKey } from '@/portfolio/assetIdentity';
import { UNTRUSTED_ASSETS } from '@/portfolio/canonicalGroups';
import { withoutUntrustedPrices } from '@/portfolio/untrustedAssets';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('@extension-base/stores/NetworkMap', () => ({
  default: class {
    async getAndWait() { return undefined; }
    get(_key: string, update: (value: undefined) => void) {
      update(undefined);
    }
    set() {}
  },
}));
vi.mock('@extension-base/stores/SelectedNetworkStore', () => ({
  default: class {
    get(_key: string, update: (value: undefined) => void) {
      update(undefined);
    }
    set() {}
  },
}));
vi.mock('@extension-base/services/network-service/handlers/EvmApiHandler', () => ({ EvmApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/SubstrateApiHandler', () => ({ SubstrateApiHandler: class {} }));
vi.mock('@extension-base/services/network-service/handlers/TonApiHandler', () => ({ TonApiHandler: class {} }));

// Kusama AssetHub Assets id 11: a third-party token the registry calls "tether usd" and prices as Tether.
const [UNTRUSTED] = UNTRUSTED_ASSETS;
const KUSAMA_ASSET_HUB = 'Kusama AssetHub';
const POLKADOT_ASSET_HUB = 'Polkadot AssetHub';

const assetOf = (network: NetworkJson | undefined, assetId: string) => network?.assets.find(({ id }) => id === assetId);
const named = (networks: NetworkJson[], name: string) => networks.find((network) => network.name === name);

describe('untrusted registry prices at the registry boundary', () => {
  beforeEach(() => {
    vi.mocked(axios.get).mockReset();
    storageMock.get.mockReset();
    storageMock.set.mockReset();
  });

  it('strips the price of a listed asset only, and leaves other networks untouched', () => {
    const registry = readSnapshot();
    const kusamaAssetHub = named(registry, KUSAMA_ASSET_HUB)!;
    const polkadot = named(registry, 'Polkadot')!;
    const stripped = withoutUntrustedPrices(kusamaAssetHub);

    expect(kusamaAssetHub.chainId).toBe(UNTRUSTED.chainId);
    expect(assetOf(kusamaAssetHub, UNTRUSTED.assetId)).toMatchObject({ symbol: 'usdt', priceId: 'tether' });
    expect(assetOf(stripped, UNTRUSTED.assetId)).toMatchObject({ symbol: 'usdt', priceId: '' });
    expect(stripped.assets.filter(({ id }) => id !== UNTRUSTED.assetId)).toEqual(
      kusamaAssetHub.assets.filter(({ id }) => id !== UNTRUSTED.assetId)
    );
    // The registry object itself is not edited, and a network without a listed asset is returned as it came.
    expect(assetOf(kusamaAssetHub, UNTRUSTED.assetId)?.priceId).toBe('tether');
    expect(withoutUntrustedPrices(polkadot)).toBe(polkadot);
  });

  it('loads the registry without the untrusted price, for every reader of the network map', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: readSnapshot() });
    const service = new NetworkService({ getAllMainAccounts: () => [] } as never, {} as State);

    await service.initNetworkMap();

    const readers = {
      registry: named(service.networksGithub, KUSAMA_ASSET_HUB),
      networkMap: service.networkMap[KUSAMA_ASSET_HUB],
      discovery: named(service.authoritativeDiscoveryNetworks, KUSAMA_ASSET_HUB),
    };
    Object.entries(readers).forEach(([reader, network]) =>
      expect(assetOf(network, UNTRUSTED.assetId)?.priceId, reader).toBe('')
    );

    // The asset page and the Send fiat line read the token group's price id.
    const groups = getMockAssets(service.networkMap, WalletEcosystem.Substrate);
    const untrustedGroup = groups.find(({ groupId, mainNetwork }) => groupId === UNTRUSTED.assetId && mainNetwork === KUSAMA_ASSET_HUB)!;
    expect(untrustedGroup.priceId).toBeFalsy();
    expect(untrustedGroup.balances[0].priceId).toBeFalsy();

    // Tether's own asset on Polkadot AssetHub keeps its price, and the price request still asks for it.
    const tether = service.networkMap[POLKADOT_ASSET_HUB].assets.find(({ currencyId }) => currencyId === '1984')!;
    expect(tether.priceId).toBe('tether');
    expect(service.assetsMap.filter(({ priceId }) => priceId === 'tether').map(({ id }) => id)).not.toContain(UNTRUSTED.assetId);
  });

  it('drops a price id an earlier build cached for a listed asset', async () => {
    const address = 'substrate-owner';
    const kusamaAssetHub = withoutUntrustedPrices(named(readSnapshot(), KUSAMA_ASSET_HUB)!);
    const key = createAssetKey({ ecosystem: 'substrate', chainId: kusamaAssetHub.chainId, assetId: UNTRUSTED.assetId });
    const cached = {
      assetMetadataSource: 'registry',
      assetMetadataTrust: 'verified',
      chain: kusamaAssetHub.name,
      currencyId: '11',
      icon: 'kusama',
      id: UNTRUSTED.assetId,
      name: kusamaAssetHub.name,
      precision: 4,
      // Cached before the list existed, with the registry's price id of the time.
      priceId: 'tether',
      state: APIItemState.READY,
      symbol: 'usdt',
      timestamp: 1,
      total: '50000',
      transferable: '50000',
      type: 'assets',
    } as BalanceItem & { chain: string };
    storageMock.get.mockResolvedValue({ assetBalances: { [address]: { [key]: cached } }, networkScanStates: {} });

    const service = new BalanceService({
      networkService: { networkMap: { [kusamaAssetHub.name]: kusamaAssetHub }, networkValues: [kusamaAssetHub] },
    } as unknown as State);
    service.generateDefaultBalance(address, WalletEcosystem.Substrate);
    await service.hydrateBalanceStorage([address]);

    const group = service.balanceMap[address].find(({ groupId }) => groupId === UNTRUSTED.assetId)!;
    expect(group.balances[0]).toMatchObject({ id: UNTRUSTED.assetId, total: '50000', state: APIItemState.READY });
    expect(group.balances[0].priceId).toBeUndefined();
    expect(group.priceId).toBeFalsy();
  });
});
