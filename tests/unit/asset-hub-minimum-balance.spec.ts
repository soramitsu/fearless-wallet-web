import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { describe, expect, it, vi } from 'vitest';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));

const ADDRESS = 'substrate-wallet';
const NETWORK = 'Polkadot AssetHub';
const USDT = 'asset-hub-usdt';
const USDC = 'asset-hub-usdc';
const DED = 'asset-hub-ded';

const registryAssets = [
  { id: USDT, type: 'assets', currencyId: '1984', symbol: 'usdt' },
  { id: USDC, type: 'assets', currencyId: '1337', symbol: 'usdc' },
  // A registry minimum is kept: the chain is not asked for it.
  { id: DED, type: 'assets', currencyId: '30', symbol: 'ded', existentialDeposit: '1' },
];

const item = (id: string, network = NETWORK): BalanceItem =>
  ({ state: APIItemState.READY, name: network.toLowerCase(), id, symbol: id, precision: 6, type: 'assets' }) as BalanceItem;

const group = (balance: BalanceItem): TokenGroup =>
  ({ groupId: balance.id, mainNetwork: NETWORK, symbol: balance.symbol, balances: [balance] }) as unknown as TokenGroup;

const some = (minBalance: string) => ({ isSome: true, unwrap: () => ({ minBalance: { toString: () => minBalance } }) });

function setup(details: Record<string, unknown>) {
  const asset = vi.fn(async (assetId: unknown) => {
    const value = details[String(assetId)];

    if (value instanceof Error) throw value;

    return value;
  });
  const lazyNext = vi.fn();
  const state = {
    networkService: {
      networkMap: { [NETWORK]: { name: NETWORK, assets: registryAssets } },
      assetsMap: registryAssets,
      substrateApiHandler: { api: { 'polkadot assethub': { api: { query: { assets: { asset } } } } } },
    },
    timeoutService: { lazyNext },
  } as unknown as State;
  const service = new BalanceService(state);
  const usdt = item(USDT);
  const usdc = item(USDC);
  const otherNetworkUsdt = item(USDT, 'Kusama AssetHub');

  service.balanceMap[ADDRESS] = [group(usdt), group(usdc), group(item(DED)), group(otherNetworkUsdt)];

  return { asset, lazyNext, otherNetworkUsdt, service, usdc, usdt };
}

describe('Asset Hub asset minimum balances', () => {
  // The registry lists no minimum for Asset Hub assets, so a send that left less than it went through unasked.
  it('reads each asset\'s min balance from the chain once its API is ready and publishes it', async () => {
    const { asset, lazyNext, otherNetworkUsdt, service, usdc, usdt } = setup({ 1984: some('10000'), 1337: some('70000') });

    await service.updateAssetMinimums('polkadot assethub');

    expect(asset.mock.calls.map(([assetId]) => assetId)).toEqual(['1984', '1337']);
    expect(usdt.existentialDeposit).toBe('10000');
    expect(usdc.existentialDeposit).toBe('70000');
    // Another network's balance with the same registry id keeps its own minimum.
    expect(otherNetworkUsdt.existentialDeposit).toBeUndefined();
    expect(lazyNext).toHaveBeenCalledOnce();
  });

  it('keeps going when one asset cannot be read, and publishes nothing when nothing changed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { lazyNext, service, usdc, usdt } = setup({ 1984: new Error('not encodable'), 1337: some('70000') });

    await service.updateAssetMinimums('polkadot assethub');

    expect(usdt.existentialDeposit).toBeUndefined();
    expect(usdc.existentialDeposit).toBe('70000');
    expect(warn).toHaveBeenCalledOnce();

    await service.updateAssetMinimums('polkadot assethub');
    expect(lazyNext).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('leaves an asset the chain does not know without a minimum', async () => {
    const { service, usdc, usdt } = setup({ 1984: { isSome: false, unwrap: () => undefined }, 1337: some('70000') });

    await service.updateAssetMinimums('polkadot assethub');

    expect(usdt.existentialDeposit).toBeUndefined();
    expect(usdc.existentialDeposit).toBe('70000');
  });

  it('does nothing on a network without an assets pallet', async () => {
    const { service, usdt } = setup({});
    (service as unknown as { state: State }).state.networkService.substrateApiHandler.api['polkadot assethub'] = {
      api: { query: {} },
    } as never;

    await expect(service.updateAssetMinimums('polkadot assethub')).resolves.toBeUndefined();
    expect(usdt.existentialDeposit).toBeUndefined();
  });
});
