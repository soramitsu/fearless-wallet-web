import { afterEach, describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const storageMock = vi.hoisted(() => {
  let stored: Record<string, unknown> = {};

  return {
    get stored() { return stored; },
    get: vi.fn(async () => structuredClone(stored)),
    set: vi.fn(async (value: Record<string, unknown>) => { stored = { ...stored, ...structuredClone(value) }; }),
  };
});

vi.mock('@extension-base/stores/Storage', () => ({ storage: storageMock }));

const OWNER = 'substrate-owner';
const EVM_ADDRESS = `0x${'aa'.repeat(20)}`;
const ETH_ID = 'c2a6c062-d511-4bde-9ce6-ea775d2a302c';
const KAIA_ID = '0a4f63d8-2c9f-4b38-a7a5-6f0d1c1e59a2';

const network = (name: string, chainId: string, assetId: string, symbol: string) => ({
  name,
  chainId,
  ecosystem: 'ethereum',
  active: true,
  icon: symbol,
  assets: [{ id: assetId, symbol, precision: 18, isUtility: true }],
}) as unknown as NetworkJson;

// A wallet with two EVM networks, each with only its native asset (registry ids differ between networks).
function evmWallet() {
  const networks = [network('Ethereum', '1', ETH_ID, 'ETH'), network('Kaia Mainnet', '8217', KAIA_ID, 'KAIA')];
  const apis = Object.fromEntries(networks.map(({ name }) => [name, {
    timeout: {} as Record<string, number>,
    api: { getBalance: vi.fn(async () => 10n ** 18n) },
  }]));
  const state = {
    isReady: () => true,
    currentAccount: { address: OWNER, ethereumAddress: EVM_ADDRESS },
    getEvmApi: (name: string) => apis[name],
    keyringService: {
      getAllMainAccounts: () => [{ address: OWNER, meta: {} }],
      getSubstrateAddress: () => OWNER,
    },
    networkService: {
      networkValues: networks,
      networkMap: Object.fromEntries(networks.map((item) => [item.name, item])),
      evmApiHandler: { failover: () => undefined },
    },
    timeoutService: { lazyNext: vi.fn() },
  } as unknown as State;
  const service = new BalanceService(state);
  (state as unknown as { balanceService: BalanceService }).balanceService = service;
  service.generateDefaultBalance(OWNER, WalletEcosystem.Substrate);

  return { apis, service };
}

describe('the EVM refresh an asset page asks for', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the asset on its network and leaves the other networks as they were', async () => {
    const { apis, service } = evmWallet();

    await expect(service.evmBalanceService.fetchBalance({
      networks: ['ethereum', 'kaia mainnet'],
      assetId: ETH_ID,
    })).resolves.toEqual([{ balance: '1.0', assetId: ETH_ID, network: 'Ethereum' }]);

    expect(apis['Kaia Mainnet'].api.getBalance).not.toHaveBeenCalled();
    expect(service.networkScanStates[OWNER]['Kaia Mainnet']).toBeUndefined();
    expect((storageMock.stored.networkScanStates as Record<string, Record<string, unknown>>)[OWNER]['Kaia Mainnet'])
      .toBeUndefined();
    expect(service.networkScanStates[OWNER].Ethereum).toMatchObject({ stale: false });

    // Kaia's next wallet-screen refresh is not held back by the asset page.
    await service.evmBalanceService.fetchBalance({ networks: ['kaia mainnet'] });
    expect(apis['Kaia Mainnet'].api.getBalance).toHaveBeenCalledOnce();
    expect(service.balanceMap[OWNER].flatMap(({ balances }) => balances).find(({ id }) => id === KAIA_ID))
      .toMatchObject({ state: APIItemState.READY, total: '1.0' });
  });
});
