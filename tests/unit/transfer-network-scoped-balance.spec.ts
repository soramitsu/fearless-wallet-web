import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import { makeTransfer } from '@extension-base/api/substrate/transfer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type State from '@extension-base/background/handlers/State';

const mocks = vi.hoisted(() => ({ signAndSendExtrinsic: vi.fn() }));

vi.mock('@extension-base/stores/Storage', () => ({ storage: { get: vi.fn(), set: vi.fn() } }));
vi.mock('@extension-base/api/substrate/shared/signAndSendExtrinsic', () => ({
  signAndSendExtrinsic: mocks.signAndSendExtrinsic,
}));
vi.mock('@extension-base/api/substrate', () => ({
  getAssetOptions: () => ({}),
  getPrecisionValue: (amount: string) => amount,
}));

const DOT = '887a17c7-1370-4de0-97dd-5422e294fa75';
const DAI = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';
const ADDRESS = 'substrate-wallet';

const group = (id: string, network: string, relayChain: string, transferable: string): TokenGroup =>
  ({
    groupId: id,
    mainNetwork: network,
    symbol: 'dot',
    tokenName: 'Polkadot',
    relayChain,
    icon: 'dot',
    providers: [],
    balances: [
      {
        state: APIItemState.READY,
        name: network.toLowerCase(),
        id,
        symbol: 'dot',
        precision: 10,
        type: 'normal',
        icon: network,
        transferable,
        total: transferable,
      } as BalanceItem,
    ],
  }) as TokenGroup;

function serviceWith(groups: TokenGroup[]) {
  const service = new BalanceService({ networkService: { networkValues: [] } } as unknown as State);

  service.balanceMap[ADDRESS] = groups;

  return service;
}

describe('background token lookup with a shared registry id', () => {
  beforeEach(() => mocks.signAndSendExtrinsic.mockReset());

  it('selects the group of the requested network and keeps the legacy first match without one', () => {
    const service = serviceWith([
      group(DOT, 'Polkadot', 'polkadot', '2'),
      group(DOT, 'Polkadot AssetHub', 'polkadot', '0.5'),
      group(DAI, 'Arbitrum One', 'ethereum', '1'),
      group(DAI, 'OP Mainnet', 'ethereum', '25'),
    ]);

    expect(service.getTokenBalance(ADDRESS, DOT, 'polkadot', 'Polkadot AssetHub').balances[0].name).toBe(
      'polkadot assethub'
    );
    expect(service.getTokenBalance(ADDRESS, DAI, 'ethereum', 'op mainnet').balances[0].transferable).toBe('25');
    expect(service.getTokenBalance(ADDRESS, DAI, 'ethereum', 'Arbitrum One').balances[0].transferable).toBe('1');

    // Callers that do not know the network keep the previous behaviour.
    expect(service.getTokenBalance(ADDRESS, DOT, 'polkadot').balances[0].name).toBe('polkadot');
    // An unknown network falls back instead of failing.
    expect(service.getTokenBalance(ADDRESS, DAI, 'ethereum', 'Optimism').balances[0].name).toBe('arbitrum one');
  });

  it('builds a Polkadot AssetHub DOT transfer from the AssetHub balance', async () => {
    const relayTransfer = vi.fn(() => 'polkadot-extrinsic');
    const assetHubTransfer = vi.fn(() => 'assethub-extrinsic');
    const service = serviceWith([group(DOT, 'Polkadot', 'polkadot', '2'), group(DOT, 'Polkadot AssetHub', 'polkadot', '0.5')]);
    const state = {
      balanceService: service,
      keyringService: { getSubstrateAddress: () => ADDRESS },
      networkService: { assetsMap: {} },
      getSubstrateApiMap: {
        polkadot: { api: { isReady: Promise.resolve(), tx: { balances: { transferAllowDeath: relayTransfer } } } },
        'polkadot assethub': {
          api: { isReady: Promise.resolve(), tx: { balances: { transferAllowDeath: assetHubTransfer } } },
        },
      },
    } as unknown as State;

    await makeTransfer({
      amount: '0.25',
      assetId: DOT,
      from: ADDRESS,
      isMobile: false,
      networkKey: 'Polkadot AssetHub',
      state,
      to: 'recipient',
    });

    expect(assetHubTransfer).toHaveBeenCalledWith('recipient', '0.25');
    expect(relayTransfer).not.toHaveBeenCalled();
    expect(mocks.signAndSendExtrinsic).toHaveBeenCalledWith(
      expect.objectContaining({ extrinsic: 'assethub-extrinsic' }),
      state
    );
  });
});
