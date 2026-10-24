import { Address } from '@ton/core';
import { HistoryService } from '@extension-base/services/history-service';
import { RegistryNodeTonProvider, TiTonProvider, type TonDataProvider } from '@extension-base/services/ton-provider';
import tiResponses from '../fixtures/ton/ti-responses-20261011.json';
import type { TonApiClientLike } from '@extension-base/services/ton-provider/RegistryNodeTonProvider';
import type State from '@extension-base/background/handlers/State';
import type { HistoryElement, TonEvent } from '@/interfaces';
import { TON_ID } from '@/consts/currencies';
import { getHumanTransferFee } from '@/helpers/history';

const NETWORK = 'TON Mainnet';
const tonAsset = { id: TON_ID, symbol: 'ton', isUtility: true };

vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ getNetwork: () => ({ name: NETWORK, assets: [tonAsset] }) }) }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ balances: [{ symbol: 'ton', balances: [{ id: TON_ID, precision: 9 }] }] }),
}));

const ADDRESS = Address.parse(tiResponses.address);

async function historyThrough(provider: TonDataProvider): Promise<TonEvent[]> {
  const state = {
    getTonApiMap: { [NETWORK.toLowerCase()]: { api: provider } },
    keyringService: {
      tonKeyring: {
        accountSubject: { value: { [tiResponses.address]: { walletContract: { address: ADDRESS } } } },
        getUserFriendlyAddress: (address: Address) => address.toString({ bounceable: false }),
      },
    },
  } as unknown as State;

  const history = await new HistoryService(state).fetchTonAssetsHistory({ address: tiResponses.address, network: NETWORK });

  return history[TON_ID];
}

const feeOf = (event: TonEvent) => getHumanTransferFee(event as unknown as HistoryElement, NETWORK);

describe('the network fee of TON history', () => {
  it('is unknown, not 0, for history read from TI, whose transactions carry no fee', async () => {
    const fetchFn = vi.fn(async (input: string) => {
      const { pathname, search } = new URL(input);
      const body =
        pathname === '/api/indexer/v1/service-info'
          ? tiResponses.sourceMainnetServiceInfo
          : { ...tiResponses.deployed.txsPage1.body, network: 'mainnet', txs: tiResponses.deployed.txsPage1.body.txs.slice(0, 2) };

      return new Response(JSON.stringify(body), { status: pathname.endsWith('/txs') && search !== '?page=1' ? 404 : 200 });
    });
    const ti = new TiTonProvider('https://ti.soramitsu.io', 'mainnet', fetchFn);
    await ti.verify();

    const events = await historyThrough(ti);

    expect(events).toHaveLength(2);
    events.forEach((event) => {
      expect(event.networkFee).toBeUndefined();
      expect(feeOf(event)).toBeNull();
    });
  });

  it('is the fee the registry node reports, in TON', async () => {
    const client = {
      blockchain: { getBlockchainMasterchainHead: async () => ({ globalId: -239 }) },
      accounts: {
        getAccountEvents: async () => ({
          events: [
            {
              eventId: 'event-1',
              timestamp: 1_791_533_127,
              extra: 12_500_000n,
              actions: [
                {
                  type: 'TonTransfer',
                  status: 'ok',
                  TonTransfer: { amount: 1_000_000_000n, sender: { address: ADDRESS }, recipient: { address: ADDRESS } },
                },
              ],
            },
          ],
        }),
      },
    } as unknown as TonApiClientLike;
    const node = new RegistryNodeTonProvider('https://tonapi.io', 'mainnet', client);
    await node.verify();

    const [event] = await historyThrough(node);

    expect(event.networkFee).toBe('12500000');
    expect(feeOf(event)).toBe(0.0125);
  });
});
