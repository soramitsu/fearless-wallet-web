import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import IrohaBalanceService, { type IrohaBalanceClient } from '@extension-base/services/balance-service/IrohaBalanceService';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

type Fixture = {
  vectors: Array<{
    expected: {
      iroha: {
        nexus: { i105: string };
        taira: { i105: string };
      };
    };
  }>;
};

const fixture = (await import('../../docs/universal-wallet-v2-vectors.json', { assert: { type: 'json' } })) as Fixture;

const TAIRA_ACCOUNT_ID = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ACCOUNT_ID = fixture.vectors[0].expected.iroha.nexus.i105;
const SUBSTRATE_ADDRESS = 'substrate-address';

const irohaNetwork = (name: string, chainId: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [
      {
        color: '#1b6f5c',
        icon: 'xor',
        id: 'xor#sora',
        isNative: true,
        isUtility: true,
        name: 'XOR',
        precision: 18,
        priceId: 'XOR',
        providers: [],
        staking: '',
        symbol: 'XOR',
        tonType: 'normal',
        type: 'iroha',
      },
    ],
    chain: name,
    chainId,
    currentProvider: '',
    customNodes: [],
    disabled: false,
    ecosystem: 'iroha',
    favorite: [],
    genesisHash: chainId,
    icon: 'iroha',
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

const routeBody = <TBody>(body: TBody) => ({
  body,
  contentType: 'application/json',
  headers: {},
  status: 200,
});

const createState = (networks: NetworkJson[], balanceMap: Record<string, TokenGroup[]> = {}) => {
  const updateBalanceStore = vi.fn();
  const publishBalance = vi.fn();
  const networkMap = networks.reduce<Record<string, NetworkJson>>((result, network) => {
    result[network.name] = network;

    return result;
  }, {});
  const state = {
    balanceService: {
      balanceMap,
      publishBalance,
      updateBalanceStore,
    },
    networkService: {
      activeNetworkByEcosystem: {
        iroha: networks,
      },
      networkMap,
    },
    timeoutService: {
      lazyNext: (_key: string, callback: () => void) => callback(),
    },
  } as unknown as State;

  return { publishBalance, state, updateBalanceStore };
};

describe('IrohaBalanceService', () => {
  it('fetches Taira assets through Torii and updates the local balance map', async () => {
    const taira = irohaNetwork('Taira', 'iroha3-taira');
    const { publishBalance, state, updateBalanceStore } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            {
              account_id: TAIRA_ACCOUNT_ID,
              asset: 'xor#sora',
              quantity: '340282366920938463463374607431768211455',
              scope: 'global',
            },
          ],
        })
      ),
      getAssetDefinitions: vi.fn().mockResolvedValue({
        items: [{ id: 'xor#sora', metadata: { precision: '18', symbol: 'XOR' }, name: 'SORA XOR' }],
      }),
    };
    const clientFactory = vi.fn(() => client);
    const service = new IrohaBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        irohaAddress: TAIRA_ACCOUNT_ID,
        networks: ['taira'],
      })
    ).resolves.toEqual([
      {
        assetId: 'xor#sora',
        balance: '340282366920938463463374607431768211455',
        network: 'Taira',
      },
    ]);

    expect(clientFactory).toHaveBeenCalledWith(taira, 'taira');
    expect(client.getAccountAssets).toHaveBeenCalledWith(TAIRA_ACCOUNT_ID, { limit: 500 });
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      free: '340282366920938463463374607431768211455',
      precision: 18,
      relayChain: 'iroha',
      state: APIItemState.READY,
      symbol: 'XOR',
      total: '340282366920938463463374607431768211455',
      type: 'iroha',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ total: '340282366920938463463374607431768211455' }),
      SUBSTRATE_ADDRESS
    );
    expect(publishBalance).toHaveBeenCalled();
  });

  it('keeps cached Iroha balances when Torii balance reads fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', 'iroha3-taira');
    const existingGroup = {
      balances: [
        {
          id: 'xor#sora',
          name: 'Taira',
          state: APIItemState.READY,
          symbol: 'XOR',
          total: '7',
        },
      ],
      groupId: 'xor#sora',
      icon: 'xor',
      mainNetwork: 'Taira',
      priceId: 'XOR',
      providers: [],
      relayChain: 'iroha',
      symbol: 'XOR',
      tokenName: 'XOR',
    } as TokenGroup;
    const { state, updateBalanceStore } = createState([taira], { [SUBSTRATE_ADDRESS]: [existingGroup] });
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockRejectedValue(new Error('torii_down')),
      getAssetDefinitions: vi.fn(),
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        irohaAddress: TAIRA_ACCOUNT_ID,
        networks: ['taira'],
      })
    ).resolves.toEqual([{ assetId: 'xor#sora', balance: '7', network: 'Taira' }]);

    expect(existingGroup.balances[0].state).toBe(APIItemState.ERROR);
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ state: APIItemState.ERROR, total: '7' }),
      SUBSTRATE_ADDRESS
    );

    warn.mockRestore();
  });

  it('uses the Nexus client path by default and fails closed when Minamoto is unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const nexus = irohaNetwork('Nexus', 'sora:nexus:global');
    const { state } = createState([nexus]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockRejectedValue(new Error('minamoto_unavailable')),
      getAssetDefinitions: vi.fn(),
    };
    const clientFactory = vi.fn(() => client);
    const service = new IrohaBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        irohaAddress: NEXUS_ACCOUNT_ID,
        networks: ['nexus'],
      })
    ).resolves.toEqual([{ assetId: 'xor#sora', balance: '0', network: 'Nexus' }]);

    expect(clientFactory).toHaveBeenCalledWith(nexus, 'nexus');
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      type: 'iroha',
    });

    warn.mockRestore();
  });
});

describe('BalanceService Iroha routing', () => {
  it('routes Iroha wallet balance refreshes to IrohaBalanceService', async () => {
    const state = { networkService: {}, timeoutService: {} } as unknown as State;
    const balanceService = new BalanceService(state);
    const fetchBalance = vi.fn().mockResolvedValue([{ assetId: 'xor#sora', balance: '1', network: 'Taira' }]);

    balanceService.irohaBalanceService = { fetchBalance } as never;

    await expect(
      balanceService.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        ethereumAddress: '',
        irohaAddress: TAIRA_ACCOUNT_ID,
        irohaNetworks: ['taira'],
        walletEcosystem: WalletEcosystem.Iroha,
      })
    ).resolves.toEqual([{ assetId: 'xor#sora', balance: '1', network: 'Taira' }]);

    expect(fetchBalance).toHaveBeenCalledWith({
      address: SUBSTRATE_ADDRESS,
      irohaAddress: TAIRA_ACCOUNT_ID,
      networks: ['taira'],
    });
  });
});
