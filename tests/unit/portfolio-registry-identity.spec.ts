import { APIItemState } from '@extension-base/api/types/networks';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import BalanceService from '@extension-base/services/balance-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockAssets as getMockAssets305 } from '../fixtures/legacy-305/getMockAssets.305';
import { SUBSTRATE_ADDRESS, groupOf, networkMap305, readSnapshot } from '../fixtures/legacy-305/generate';
import { createAccountsStore305, type Storage305 } from '../fixtures/legacy-305/toggle-hide-zero.305';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { findAssetGroup, findTransferAssetGroup } from '@/helpers/currencies';
import { WalletEcosystem } from '@/interfaces';
import {
  buildPortfolioSections,
  buildPortfolioSummary,
  createAssetKey,
  type AssetPreference,
  type PortfolioAsset,
} from '@/portfolio/assetIdentity';
import { buildLegacy305Groups, resolveLegacy305Hidden } from '@/portfolio/legacyPreferences305';
import { registryAssetKey } from '@/portfolio/zeroRule';
import { mergeUniversalWalletRegistryNetworks } from '@/util/universalWalletRegistryNetworks';

const storageMock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));
// The lookups under test are pure; the stores are only used by other exports of the module.
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn() }));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: vi.fn() }));

// The reviewed chains/v13 snapshot plus the Bitcoin, Solana and Iroha networks the runtime adds.
const networkMap = networkMap305(readSnapshot());
mergeUniversalWalletRegistryNetworks(networkMap, undefined);
const networks = Object.values(networkMap).map((network) => ({ ...network, favorite: [] })) as NetworkJson[];
const network = (name: string): NetworkJson => networks.find((candidate) => candidate.name === name)!;
const registryAsset = (networkName: string, symbol: string) =>
  network(networkName).assets.find((asset) => asset.symbol === symbol)!;
const keyOf = (networkName: string, symbol: string): string =>
  registryAssetKey(network(networkName), registryAsset(networkName, symbol));

/** The three pairs of the registry that share a `currencyId` on one network. */
const SHARED_CURRENCY_ID_PAIRS = [
  ['Acala', 'tdot', 'glmr', '0'],
  ['Karura', 'rmrk', 'taiksm', '0'],
  ['Bifrost', 'vksm', 'vsksm', 'ksm'],
] as const;

function substrateGroups(): TokenGroup[] {
  const groups = getMockAssets(networkMap, WalletEcosystem.Substrate);
  groups.forEach(({ balances }) =>
    balances.forEach((balance) => Object.assign(balance, { state: APIItemState.READY, total: '0', transferable: '0' }))
  );
  return groups;
}

function fund(groups: TokenGroup[], networkName: string, symbol: string, total: string): void {
  const { id } = registryAsset(networkName, symbol);
  const balance = groups
    .flatMap(({ balances }) => balances)
    .find((item) => item.name === networkName.toLowerCase() && item.id === id);
  if (!balance) throw new Error(`No ${symbol} on ${networkName}`);
  Object.assign(balance, { total, transferable: total });
}

const manageRows = (groups: TokenGroup[], preferences: Record<string, AssetPreference> = {}): PortfolioAsset[] =>
  buildPortfolioSections({
    groups,
    networks,
    prices: { rmrk: 2, moonbeam: 0.5, kusama: 20 },
    preferences,
    addressForNetwork: () => 'wallet',
    mode: 'manage',
    // The shared testnet list also names networks the registry ships without the `testnet` option.
    showTestnets: true,
  }).flatMap(({ assets }) => assets);

describe('one identity per registry asset', () => {
  it('finds the three shared-currencyId pairs in the reviewed registry', () => {
    SHARED_CURRENCY_ID_PAIRS.forEach(([networkName, first, second, currencyId]) => {
      expect(registryAsset(networkName, first).currencyId, `${first}@${networkName}`).toBe(currencyId);
      expect(registryAsset(networkName, second).currencyId, `${second}@${networkName}`).toBe(currencyId);
      expect(registryAsset(networkName, first).id).not.toBe(registryAsset(networkName, second).id);
    });
  });

  it('gives no two registry assets the same key, on any network of the pinned snapshot', () => {
    const owners = new Map<string, string>();

    networks.forEach((candidate) =>
      candidate.assets.forEach((asset) => {
        const key = registryAssetKey(candidate, asset);
        const label = `${asset.symbol}@${candidate.name}`;

        expect(owners.get(key), `${label} shares ${key}`).toBeUndefined();
        owners.set(key, label);
      })
    );
    expect(owners.size).toBe(networks.reduce((count, { assets }) => count + assets.length, 0));
  });

  it('renders every registry asset as its own row with its own name, symbol and route id', () => {
    const rows = manageRows(substrateGroups());
    const substrateNetworks = networks.filter(({ ecosystem }) => !['ton', 'bitcoin', 'solana', 'iroha'].includes(ecosystem));
    const expected = substrateNetworks.flatMap((candidate) =>
      candidate.assets.map((asset) => ({
        key: registryAssetKey(candidate, asset),
        assetId: asset.id,
        networkName: candidate.name,
        symbol: asset.symbol.toUpperCase(),
        name: asset.name?.trim() || asset.symbol,
      }))
    );
    const byKey = new Map(rows.map((row) => [row.key, row]));

    expect(rows).toHaveLength(expected.length);
    expect(byKey.size).toBe(rows.length);
    expected.forEach((asset) => expect(byKey.get(asset.key), asset.key).toMatchObject(asset));
  });

  it('values each asset of a shared-currencyId pair at its own registry price', () => {
    const groups = substrateGroups();
    fund(groups, 'Karura', 'rmrk', '50');
    fund(groups, 'Karura', 'taiksm', '10');
    fund(groups, 'Acala', 'glmr', '8');
    fund(groups, 'Acala', 'tdot', '3');
    fund(groups, 'Bifrost', 'vksm', '2');
    fund(groups, 'Bifrost', 'vsksm', '1');

    const rows = new Map(manageRows(groups).filter(({ hasBalance }) => hasBalance).map((row) => [row.key, row]));
    const row = (networkName: string, symbol: string) => rows.get(keyOf(networkName, symbol));

    expect(rows.size).toBe(6);
    expect(row('Karura', 'rmrk')).toMatchObject({ symbol: 'RMRK', name: 'rmrk', balanceText: '50', fiatValue: '100' });
    // taiKSM has no registry price: it must not borrow RMRK's.
    expect(row('Karura', 'taiksm')).toMatchObject({ symbol: 'TAIKSM', name: 'taiga ksm', balanceText: '10', fiatValue: null });
    expect(row('Acala', 'glmr')).toMatchObject({ symbol: 'GLMR', name: 'moonbeam', balanceText: '8', fiatValue: '4' });
    expect(row('Acala', 'tdot')).toMatchObject({ symbol: 'TDOT', name: 'tapio dot', balanceText: '3', fiatValue: null });
    expect(row('Bifrost', 'vksm')).toMatchObject({ symbol: 'VKSM', name: 'voucher ksm', balanceText: '2', fiatValue: '40' });
    expect(row('Bifrost', 'vsksm')).toMatchObject({ symbol: 'VSKSM', name: 'voucher slot ksm', balanceText: '1', fiatValue: '20' });

    expect(
      buildPortfolioSummary({ groups, networks, prices: { rmrk: 2, moonbeam: 0.5, kusama: 20 }, addressForNetwork: () => 'wallet' })
    ).toMatchObject({ total: '164', unpricedCount: 2 });
  });

  it('hides one asset of a pair without hiding the other', () => {
    const groups = substrateGroups();
    fund(groups, 'Bifrost', 'vksm', '2');
    fund(groups, 'Bifrost', 'vsksm', '1');
    const rows = manageRows(groups, { [keyOf('Bifrost', 'vksm')]: 'hidden' });
    const hidden = (symbol: string) => rows.find(({ key }) => key === keyOf('Bifrost', symbol))?.hidden;

    expect(hidden('vksm')).toBe(true);
    expect(hidden('vsksm')).toBe(false);
  });

  it('keeps a 3.0.5 hide on exactly the asset the user hid', () => {
    // 3.0.5 wrote the hide: its own grouping and its own store code, over the same registry.
    const storage: Storage305 = {};
    const store = createAccountsStore305(SUBSTRATE_ADDRESS, getMockAssets305(networkMap305(readSnapshot()), WalletEcosystem.Substrate), storage);
    store.setHiddenAssets({ groupId: groupOf(store.balances, 'vksm', 'Kusama').groupId, value: false });
    const legacyHiddenIds = JSON.parse(storage['account_hidden-assets']).value[SUBSTRATE_ADDRESS] as string[];

    const hiddenKeys = resolveLegacy305Hidden({ legacyHiddenIds, registryGroups: buildLegacy305Groups(networks) });

    expect(legacyHiddenIds).toEqual([registryAsset('Bifrost', 'vksm').id]);
    expect(hiddenKeys.has(keyOf('Bifrost', 'vksm'))).toBe(true);
    expect(hiddenKeys.has(keyOf('Bifrost', 'vsksm'))).toBe(false);
  });

  it('opens the asset the row names, for both assets of a pair', () => {
    const groups = substrateGroups();
    SHARED_CURRENCY_ID_PAIRS.forEach(([networkName, first, second]) => {
      fund(groups, networkName, first, '1');
      fund(groups, networkName, second, '2');
    });
    const rows = manageRows(groups);

    SHARED_CURRENCY_ID_PAIRS.forEach(([networkName, first, second]) =>
      [first, second].forEach((symbol) => {
        const row = rows.find(({ key }) => key === keyOf(networkName, symbol))!;
        const { id } = registryAsset(networkName, symbol);

        // The row routes with the registry id; the asset page, Send and Receive resolve that id on the row's network.
        expect(row.assetId).toBe(id);
        expect(findAssetGroup(groups, row.assetId, row.networkName)?.groupId, `${symbol} page`).toBe(id);
        expect(findTransferAssetGroup(groups, row.assetId, row.networkName)?.groupId, `${symbol} send`).toBe(id);
      })
    );
  });

  it('still resolves a link that carries the on-chain id when it names one asset only', () => {
    const groups = substrateGroups();
    const usdt = registryAsset('Polkadot AssetHub', 'usdt');

    expect(usdt.currencyId).toBe('1984');
    expect(findAssetGroup(groups, '1984', 'Polkadot AssetHub')?.groupId).toBe(usdt.id);
    expect(findAssetGroup(groups, usdt.id, 'Polkadot AssetHub')?.groupId).toBe(usdt.id);
    expect(findAssetGroup(groups, 'unknown-id', 'Polkadot AssetHub')).toBeUndefined();
  });
});

describe('balance cache identity across a background restart', () => {
  type StoredBalances = Record<string, Record<string, BalanceItem & { chain: string }>>;
  const address = 'substrate-owner';
  const bifrost = network('Bifrost');
  const vksm = registryAsset('Bifrost', 'vksm');
  const vsksm = registryAsset('Bifrost', 'vsksm');

  function mockStorage(initial: StoredBalances = {}) {
    let assetBalances = structuredClone(initial);
    let networkScanStates = {};

    storageMock.get.mockImplementation(async () => ({
      assetBalances: structuredClone(assetBalances),
      networkScanStates: structuredClone(networkScanStates),
    }));
    storageMock.set.mockImplementation(async (value) => {
      if (value.assetBalances) assetBalances = structuredClone(value.assetBalances);
      if (value.networkScanStates) networkScanStates = structuredClone(value.networkScanStates);
    });

    return { get assetBalances() { return assetBalances; } };
  }

  /** A background that just started: the registry placeholders of a Substrate wallet, nothing loaded yet. */
  function startBackground(): BalanceService {
    const service = new BalanceService({
      keyringService: { getAllMainAccounts: () => [{ address }], getSubstrateAddress: () => address },
      networkService: { networkMap: { [bifrost.name]: bifrost }, networkValues: [bifrost] },
      timeoutService: { lazyNext: vi.fn() },
    } as unknown as State);
    service.generateDefaultBalance(address, WalletEcosystem.Substrate);

    return service;
  }

  const rowOf = (service: BalanceService, id: string): BalanceItem =>
    service.balanceMap[address].flatMap(({ balances }) => balances).find((balance) => balance.id === id)!;
  const loaded = (id: string, total: string) => ({ id, state: APIItemState.READY, total, transferable: total });
  const flushStorage = async (service: BalanceService) =>
    service.updateBalanceStore(bifrost.name, rowOf(service, vksm.id), address);

  beforeEach(() => {
    storageMock.get.mockReset();
    storageMock.set.mockReset();
  });

  it('persists two assets that share a currencyId under two keys and hydrates each into its own row', async () => {
    const persisted = mockStorage();
    const first = startBackground();

    // vsKSM answers last, with zero: under a shared key it would overwrite the 20 vKSM.
    first.setBalanceItem(bifrost.name, loaded(vksm.id, '20'), address);
    first.setBalanceItem(bifrost.name, loaded(vsksm.id, '0'), address);
    await flushStorage(first);

    const vksmKey = createAssetKey({ ecosystem: 'substrate', chainId: bifrost.chainId, assetId: vksm.id });
    const vsksmKey = createAssetKey({ ecosystem: 'substrate', chainId: bifrost.chainId, assetId: vsksm.id });
    expect(persisted.assetBalances[address][vksmKey]).toMatchObject({ id: vksm.id, currencyId: 'ksm', total: '20' });
    expect(persisted.assetBalances[address][vsksmKey]).toMatchObject({ id: vsksm.id, currencyId: 'ksm', total: '0' });

    const restarted = startBackground();
    await restarted.hydrateBalanceStorage([address]);

    expect(rowOf(restarted, vksm.id)).toMatchObject({ id: vksm.id, symbol: 'vksm', total: '20', state: APIItemState.READY });
    expect(rowOf(restarted, vsksm.id)).toMatchObject({ id: vsksm.id, symbol: 'vsksm', total: '0', state: APIItemState.READY });
    expect(restarted.balanceMap[address]).toHaveLength(bifrost.assets.length);

    // Live updates after the restart still land on their own asset.
    restarted.setBalanceItem(bifrost.name, loaded(vksm.id, '21'), address);
    restarted.setBalanceItem(bifrost.name, loaded(vsksm.id, '3'), address);
    expect(rowOf(restarted, vksm.id).total).toBe('21');
    expect(rowOf(restarted, vsksm.id).total).toBe('3');
  });

  it('ignores a cache entry an earlier build wrote under the shared currencyId key', async () => {
    // What a build keyed by currencyId left behind: the vsKSM item under the key both assets shared.
    const sharedKey = createAssetKey({ ecosystem: 'substrate', chainId: bifrost.chainId, assetId: 'ksm' });
    mockStorage({
      [address]: {
        [sharedKey]: {
          ...rowOf(startBackground(), vsksm.id),
          chain: bifrost.name,
          state: APIItemState.READY,
          total: '0',
          transferable: '0',
          timestamp: 1,
        },
      },
    });
    const restarted = startBackground();
    await restarted.hydrateBalanceStorage([address]);

    // Neither row takes the other's cached amount; both wait for the network, and both accept their update.
    expect(rowOf(restarted, vksm.id)).toMatchObject({ id: vksm.id, state: APIItemState.PENDING });
    expect(rowOf(restarted, vsksm.id)).toMatchObject({ id: vsksm.id, state: APIItemState.PENDING });
    expect(() => restarted.setBalanceItem(bifrost.name, loaded(vksm.id, '20'), address)).not.toThrow();
    expect(rowOf(restarted, vksm.id).total).toBe('20');
  });
});
