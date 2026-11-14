import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMockAssets } from '@extension-base/background/helpers/assets';
import SubstrateBalanceService from '@extension-base/services/balance-service/SubstrateBalanceService';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const EVM_ADDRESS = `0x${'ab'.repeat(20)}`;

const network = (name: string, ecosystem: NetworkJson['ecosystem']): NetworkJson => ({
  name,
  ecosystem,
  assets: [{ id: `${name}-native`, symbol: name, precision: 18, isUtility: true, isNative: true, type: 'normal' }],
}) as unknown as NetworkJson;

const networkMap = {
  Polkadot: network('Polkadot', 'substrate'),
  Moonbeam: network('Moonbeam', 'ethereumBased'),
  Ethereum: network('Ethereum', 'ethereum'),
  'Ton Mainnet': network('Ton Mainnet', 'ton'),
};
const assetsMap = Object.values(networkMap).flatMap(({ assets }) => assets);

// The real codec refuses a 20-byte address on a chain with 32-byte accounts when the storage key is built.
const substrateApi = (ethereumAccounts = false) => {
  const account = Object.assign(vi.fn(async () => ({ data: { free: '1000', reserved: '0', frozen: '0' } })), {
    key: vi.fn((address: string) => {
      if (address.startsWith('0x') && !ethereumAccounts) throw new Error('Invalid decoded address length');

      return address;
    }),
  });

  return { account, api: { query: { system: { account } }, isReadyOrError: Promise.resolve() } };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the balances of an independently imported Ethereum key', () => {
  it('have no placeholder on a Substrate network, which would wait for an answer that never comes', () => {
    const names = (ecosystem: WalletEcosystem) =>
      getMockAssets(networkMap, ecosystem).flatMap(({ balances }) => balances.map(({ name }) => name));

    expect(names(WalletEcosystem.Evm)).toEqual(['moonbeam', 'ethereum']);
    expect(names(WalletEcosystem.Substrate)).toEqual(['polkadot', 'moonbeam', 'ethereum']);
  });

  it('are read only on networks with Ethereum accounts', async () => {
    const polkadot = substrateApi();
    const moonbeam = substrateApi(true);
    const setBalanceItem = vi.fn();
    const state = {
      networkService: { networkMap, assetsMap },
      getSubstrateApiMap: { polkadot: { api: polkadot.api }, moonbeam: { api: moonbeam.api } },
      balanceService: { setBalanceItem },
    };
    const service = new SubstrateBalanceService(state as never);

    const read = await service.fetchBalance({ address: EVM_ADDRESS, ethereumAddress: EVM_ADDRESS, networks: ['Polkadot', 'Moonbeam'] });

    expect(read.map(({ network: name }) => name)).toEqual(['Moonbeam']);
    expect(polkadot.account).not.toHaveBeenCalled();
    expect(polkadot.account.key).not.toHaveBeenCalled();
    expect(moonbeam.account).toHaveBeenCalledExactlyOnceWith(EVM_ADDRESS);
    expect(setBalanceItem).toHaveBeenCalledExactlyOnceWith('Moonbeam', expect.objectContaining({ id: 'Moonbeam-native' }), EVM_ADDRESS);
  });

  it('subscribe only on networks with Ethereum accounts when a connection opens, so no other network reports a failure', async () => {
    vi.useFakeTimers();
    const polkadot = substrateApi();
    const moonbeam = substrateApi(true);
    const state = {
      networkService: { networkMap, assetsMap },
      getSubstrateApiMap: { polkadot: { api: polkadot.api }, moonbeam: { api: moonbeam.api } },
    };
    const service = new SubstrateBalanceService(state as never);
    const subscribe = vi.spyOn(service, 'subscribeSubstrateAssetsBalances').mockReturnValue(() => undefined);

    const started = service.subscribeSubstrateBalances(
      { address: EVM_ADDRESS, ethereumAddress: EVM_ADDRESS, substrateNetworks: ['polkadot', 'moonbeam'] } as never,
      state as never
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.all(started);

    expect(subscribe).toHaveBeenCalledExactlyOnceWith(EVM_ADDRESS, 'moonbeam', moonbeam.api, state);
  });

  it('leave a wallet with a Substrate account reading its own address', async () => {
    const polkadot = substrateApi();
    const setBalanceItem = vi.fn();
    const state = {
      networkService: { networkMap, assetsMap },
      getSubstrateApiMap: { polkadot: { api: polkadot.api } },
      balanceService: { setBalanceItem },
    };
    const owner = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';

    await new SubstrateBalanceService(state as never).fetchBalance({ address: owner, ethereumAddress: EVM_ADDRESS, networks: ['Polkadot'] });

    expect(polkadot.account).toHaveBeenCalledExactlyOnceWith(owner);
  });
});
