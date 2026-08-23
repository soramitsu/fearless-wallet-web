import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { createAssetKey } from '@/portfolio/assetIdentity';

const storageMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

type StoredBalance = BalanceItem & { chain: string };
type AssetBalanceStorage = Record<string, Record<string, StoredBalance>>;

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

const network = (name: string, chainId: string, ecosystem: string): NetworkJson => ({
  active: true,
  assets: [],
  chainId,
  ecosystem,
  favorite: [],
  name,
} as unknown as NetworkJson);

const balance = ({
  currencyId,
  id,
  name,
  symbol,
  total,
}: {
  currencyId?: string;
  id: string;
  name: string;
  symbol: string;
  total: string;
}): BalanceItem => ({
  assetMetadataSource: 'registry',
  assetMetadataTrust: 'verified',
  currencyId,
  icon: symbol,
  id,
  name,
  precision: 18,
  state: APIItemState.READY,
  symbol,
  total,
  transferable: total,
  type: 'normal',
});

const stateFor = (networks: NetworkJson[]) => ({
  networkService: { networkValues: networks },
} as unknown as State);

function mockStorage(initial: AssetBalanceStorage = {}, legacyBalances?: unknown) {
  let assetBalances = structuredClone(initial);
  let networkScanStates = {};

  storageMock.get.mockImplementation(async () => ({
    assetBalances: structuredClone(assetBalances),
    balances: legacyBalances,
    networkScanStates: structuredClone(networkScanStates),
  }));
  storageMock.set.mockImplementation(async (value) => {
    if (value.assetBalances) assetBalances = structuredClone(value.assetBalances);
    if (value.networkScanStates) networkScanStates = structuredClone(value.networkScanStates);
  });

  return { get assetBalances() { return assetBalances; } };
}

describe('BalanceService AssetKey persistence', () => {
  beforeEach(() => {
    storageMock.get.mockReset();
    storageMock.set.mockReset();
  });

  it('serializes a stale Bitcoin deletion racing a different-network update', async () => {
    const address = 'wallet-address';
    const mainnet = network('Bitcoin', 'bitcoin:mainnet', 'bitcoin');
    const testnet = network('Bitcoin Testnet', 'bitcoin:testnet', 'bitcoin');
    const mainKey = createAssetKey({ ecosystem: 'bitcoin', chainId: 'bitcoin:mainnet', assetId: 'BTC' });
    const testKey = createAssetKey({ ecosystem: 'bitcoin', chainId: 'bitcoin:testnet', assetId: 'BTC' });
    const mainBalance = balance({ id: 'BTC', name: mainnet.name, symbol: 'BTC', total: '1' });
    const persisted = mockStorage({
      [address]: { [mainKey]: { ...mainBalance, chain: mainnet.name } },
    });
    const firstSet = deferred();
    const baseSet = storageMock.set.getMockImplementation()!;
    let setCount = 0;
    storageMock.set.mockImplementation(async (value) => {
      setCount += 1;
      if (setCount === 1) await firstSet.promise;
      await baseSet(value);
    });
    const service = new BalanceService(stateFor([mainnet, testnet]));
    const deletion = service.deleteBalanceStore(mainnet.name, { id: 'BTC' }, address);

    await vi.waitFor(() => expect(storageMock.set).toHaveBeenCalledTimes(1));
    const update = service.updateBalanceStore(
      testnet.name,
      balance({ id: 'BTC', name: testnet.name, symbol: 'BTC', total: '2' }),
      address
    );
    await Promise.resolve();
    expect(storageMock.get).toHaveBeenCalledTimes(1);

    firstSet.resolve();
    await Promise.all([deletion, update]);

    expect(storageMock.get).toHaveBeenCalledTimes(2);
    expect(persisted.assetBalances[address]?.[mainKey]).toBeUndefined();
    expect(persisted.assetBalances[address]?.[testKey]).toMatchObject({
      chain: testnet.name,
      id: 'BTC',
      total: '2',
    });
  });

  it('persists and hydrates same-symbol EVM contracts as separate lowercase AssetKeys', async () => {
    const address = '0xowner';
    const ethereum = network('Ethereum', '1', 'ethereumBased');
    const persisted = mockStorage();
    const first = balance({
      currencyId: '0xAaAa',
      id: 'registry-a',
      name: ethereum.name,
      symbol: 'USD',
      total: '1',
    });
    const second = balance({
      currencyId: '0xBbBb',
      id: 'registry-b',
      name: ethereum.name,
      symbol: 'USD',
      total: '2',
    });
    const service = new BalanceService(stateFor([ethereum]));

    await Promise.all([
      service.updateBalanceStore(ethereum.name, first, address),
      service.updateBalanceStore(ethereum.name, second, address),
    ]);

    expect(Object.keys(persisted.assetBalances[address]).sort()).toEqual([
      'ethereumbased:1:0xaaaa',
      'ethereumbased:1:0xbbbb',
    ]);

    const hydrated = new BalanceService(stateFor([ethereum]));
    hydrated.balanceMap[address] = [];
    await hydrated.hydrateBalanceStorage([address]);
    expect(hydrated.balanceMap[address].flatMap(({ balances }) => balances)).toEqual([
      expect.objectContaining({ currencyId: '0xAaAa', total: '1' }),
      expect.objectContaining({ currencyId: '0xBbBb', total: '2' }),
    ]);
  });

  it('uses the merged full identity for partial updates and preserves Substrate currencyId', async () => {
    const address = 'substrate-owner';
    const assetHub = network('Polkadot Asset Hub', 'asset-hub', 'substrate');
    const persisted = mockStorage();
    const service = new BalanceService({
      keyringService: {
        getAllMainAccounts: () => [{ address }],
        getSubstrateAddress: () => address,
      },
      networkService: { networkValues: [assetHub] },
      timeoutService: { lazyNext: vi.fn() },
    } as unknown as State);
    service.balanceMap[address] = [{
      balances: [balance({
        currencyId: '{"ForeignAsset":42}',
        id: 'registry-usdt',
        name: assetHub.name,
        symbol: 'USDT',
        total: '0',
      })],
      groupId: 'registry-usdt',
      icon: 'USDT',
      mainNetwork: assetHub.name,
      providers: [],
      relayChain: 'polkadot' as never,
      symbol: 'USDT',
      tokenName: 'USDT',
    }];

    service.setBalanceItem(assetHub.name, {
      id: 'registry-usdt',
      state: APIItemState.READY,
      total: '9',
      transferable: '9',
    }, address);
    await vi.waitFor(() => expect(storageMock.set).toHaveBeenCalled());

    const key = createAssetKey({
      ecosystem: 'substrate',
      chainId: 'asset-hub',
      assetId: '{"ForeignAsset":42}',
    });
    expect(persisted.assetBalances[address]?.[key]).toMatchObject({
      currencyId: '{"ForeignAsset":42}',
      id: 'registry-usdt',
      total: '9',
    });
  });

  it('ignores legacy merged symbol storage and writes exact AssetKeys after rescan', async () => {
    const address = 'legacy-owner';
    const ethereum = network('Ethereum', '1', 'ethereumBased');
    const persisted = mockStorage({}, {
      [address]: { USD: { Ethereum: { symbol: 'USD', total: '999' } } },
    });
    const service = new BalanceService(stateFor([ethereum]));
    service.balanceMap[address] = [];

    await service.hydrateBalanceStorage([address]);
    expect(service.balanceMap[address]).toEqual([]);

    await service.updateBalanceStore(
      ethereum.name,
      balance({ currencyId: '0xCcCc', id: 'registry-c', name: ethereum.name, symbol: 'USD', total: '3' }),
      address
    );
    expect(persisted.assetBalances[address]).toEqual({
      'ethereumbased:1:0xcccc': expect.objectContaining({ id: 'registry-c', total: '3' }),
    });
  });
});
