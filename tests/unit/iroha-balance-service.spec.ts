import { APIItemState } from '@extension-base/api/types/networks';
import BalanceService from '@extension-base/services/balance-service';
import IrohaBalanceService, {
  type IrohaBalanceClient,
} from '@extension-base/services/balance-service/IrohaBalanceService';
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
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const TAIRA_VAL_ASSET_ID = '7YWHMfk9JZeLQPBznJqwr8fh9fUo';

const irohaNetwork = (name: string, chainId: string): NetworkJson => {
  const isTaira = name === 'Taira';

  return {
    active: true,
    addressPrefix: 0,
    assets: [
      {
        color: '#1b6f5c',
        icon: 'xor',
        id: isTaira ? TAIRA_XOR_ASSET_ID : 'xor#sora',
        isNative: true,
        isUtility: true,
        name: 'XOR',
        precision: isTaira ? 9 : 18,
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
  } as unknown as NetworkJson;
};

const routeBody = <TBody>(body: TBody) => ({
  body:
    typeof body === 'object' && body !== null && 'items' in body
      ? { count_mode: 'bounded', has_more: false, ...body }
      : body,
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
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { publishBalance, state, updateBalanceStore } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            {
              account_id: TAIRA_ACCOUNT_ID,
              asset: TAIRA_XOR_ASSET_ID,
              quantity: '340282366920938463463374607431768211455',
              scope: 'global',
            },
          ],
        })
      ),
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            {
              id: TAIRA_XOR_ASSET_ID,
              metadata: { symbol: 'XOR' },
              name: 'SORA XOR',
              spec: { scale: 9 },
            },
          ],
        })
      ),
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
        assetId: TAIRA_XOR_ASSET_ID,
        balance: '340282366920938463463374607431768211455',
        network: 'Taira',
      },
    ]);

    expect(clientFactory).toHaveBeenCalledWith(taira, 'taira');
    expect(client.getAccountAssets).toHaveBeenCalledWith(TAIRA_ACCOUNT_ID, {
      countMode: 'bounded',
      limit: 500,
      offset: 0,
    });
    expect(client.getAssetDefinitions).toHaveBeenCalledWith({ countMode: 'bounded', limit: 500, offset: 0 });
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      free: '340282366920938463463374607431768211455',
      precision: 9,
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

  it.each([
    ['missing', null],
    ['mismatched', 8],
  ] as const)('fails a zero-balance Taira read closed when the native Torii scale is %s', async (_label, scale) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(routeBody({ items: [] })),
      getAssetDefinitions: vi
        .fn()
        .mockResolvedValue(routeBody({ items: [{ id: TAIRA_XOR_ASSET_ID, name: 'XOR', spec: { scale } }] })),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);

    expect(client.getAssetDefinitions).toHaveBeenCalled();
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      id: TAIRA_XOR_ASSET_ID,
      state: APIItemState.ERROR,
    });
    warn.mockRestore();
  });

  it('fails closed when account assets exceed one complete bounded snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const getAccountAssets = vi.fn().mockResolvedValue(
      routeBody({
        has_more: true,
        items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '1', scope: 'global' }],
      })
    );
    const getAssetDefinitions = vi.fn();
    const client: IrohaBalanceClient = {
      getAccountAssets: getAccountAssets as IrohaBalanceClient['getAccountAssets'],
      getAssetDefinitions: getAssetDefinitions as IrohaBalanceClient['getAssetDefinitions'],
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);

    expect(getAccountAssets).toHaveBeenCalledTimes(1);
    expect(getAccountAssets).toHaveBeenCalledWith(TAIRA_ACCOUNT_ID, {
      countMode: 'bounded',
      limit: 500,
      offset: 0,
    });
    expect(getAssetDefinitions).not.toHaveBeenCalled();
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
    warn.mockRestore();
  });

  it('fails closed when definitions exceed one complete bounded snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const getAssetDefinitions = vi.fn().mockResolvedValue(
      routeBody({ has_more: true, items: [{ id: TAIRA_XOR_ASSET_ID, name: 'XOR', spec: { scale: 9 } }] })
    );
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '123', scope: 'global' }],
        })
      ),
      getAssetDefinitions: getAssetDefinitions as IrohaBalanceClient['getAssetDefinitions'],
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);

    expect(getAssetDefinitions).toHaveBeenCalledTimes(1);
    expect(getAssetDefinitions).toHaveBeenCalledWith({ countMode: 'bounded', limit: 500, offset: 0 });
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
    warn.mockRestore();
  });

  it('adds scoped Torii quantities exactly without floating-point rounding', async () => {
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '0.1', scope: 'global' },
            { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '0.2', scope: 'dataspace:1' },
          ],
        })
      ),
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({ items: [{ id: TAIRA_XOR_ASSET_ID, metadata: { symbol: 'XOR' }, spec: { scale: 9 } }] })
      ),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0.3', network: 'Taira' }]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.READY,
      total: '0.3',
    });
  });

  it('normalizes an exact scoped sum before enforcing the Iroha Numeric bound', async () => {
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const maximum = (1n << 511n) - 1n;
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            {
              account_id: TAIRA_ACCOUNT_ID,
              asset: TAIRA_XOR_ASSET_ID,
              quantity: (maximum - 1n).toString(),
              scope: 'global',
            },
            { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '0.1', scope: 'dataspace:1' },
            { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '0.9', scope: 'dataspace:2' },
          ],
        })
      ),
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({ items: [{ id: TAIRA_XOR_ASSET_ID, metadata: { symbol: 'XOR' }, spec: { scale: 9 } }] })
      ),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: maximum.toString(), network: 'Taira' }]);
  });

  it('fails every malformed or compatibility account-asset row closed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const canonical = {
      account_id: TAIRA_ACCOUNT_ID,
      asset: TAIRA_XOR_ASSET_ID,
      quantity: '1',
      scope: 'global',
    };
    const malformed = [
      { ...canonical, account_id: NEXUS_ACCOUNT_ID },
      { asset: TAIRA_XOR_ASSET_ID, quantity: '1', scope: 'global' },
      { ...canonical, accountId: TAIRA_ACCOUNT_ID },
      { ...canonical, asset_id: TAIRA_XOR_ASSET_ID },
      { ...canonical, assetName: 'XOR' },
      { ...canonical, asset: 'not-canonical' },
      { ...canonical, value: '1' },
      { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '1' },
      { ...canonical, scope: 'dataspace:01' },
      { ...canonical, quantity: ' 1' },
      { ...canonical, quantity: '1.0' },
      { ...canonical, quantity: '1e0' },
      { ...canonical, quantity: (1n << 511n).toString() },
    ];

    try {
      for (const item of malformed) {
        const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
        const { state } = createState([taira]);
        const client: IrohaBalanceClient = {
          getAccountAssets: vi.fn().mockResolvedValue(routeBody({ items: [item] })),
          getAssetDefinitions: vi.fn(),
        };
        const service = new IrohaBalanceService(
          state,
          vi.fn(() => client)
        );

        await expect(
          service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
        ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);
        expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('fails closed when Torii repeats an asset and scope in one snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const duplicate = {
      account_id: TAIRA_ACCOUNT_ID,
      asset: TAIRA_XOR_ASSET_ID,
      quantity: '1',
      scope: 'global',
    };
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(routeBody({ items: [duplicate, duplicate] })),
      getAssetDefinitions: vi.fn(),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);
    expect(client.getAssetDefinitions).not.toHaveBeenCalled();
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
    warn.mockRestore();
  });

  it('fails closed when Torii returns a non-canonical Taira definition id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '1', scope: 'global' }],
        })
      ),
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            { id: TAIRA_XOR_ASSET_ID, spec: { scale: 9 } },
            { id: 'xor#universal', spec: { scale: 9 } },
          ],
        })
      ),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
    warn.mockRestore();
  });

  it('fails closed when individually valid scoped quantities overflow Iroha Numeric when added', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            {
              account_id: TAIRA_ACCOUNT_ID,
              asset: TAIRA_XOR_ASSET_ID,
              quantity: ((1n << 511n) - 1n).toString(),
              scope: 'global',
            },
            { account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '1', scope: 'dataspace:1' },
          ],
        })
      ),
      getAssetDefinitions: vi.fn(),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '0', network: 'Taira' }]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0].state).toBe(APIItemState.ERROR);
    warn.mockRestore();
  });

  it('keeps cached balances stale when definition retrieval fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const existingGroup = {
      balances: [{ id: TAIRA_XOR_ASSET_ID, name: 'Taira', state: APIItemState.READY, symbol: 'XOR', total: '7' }],
      groupId: TAIRA_XOR_ASSET_ID,
      icon: 'xor',
      mainNetwork: 'Taira',
      priceId: 'XOR',
      providers: [],
      relayChain: 'iroha',
      symbol: 'XOR',
      tokenName: 'XOR',
    } as TokenGroup;
    const { state } = createState([taira], { [SUBSTRATE_ADDRESS]: [existingGroup] });
    const client: IrohaBalanceClient = {
      getAccountAssets: vi
        .fn()
        .mockResolvedValue(
          routeBody({
            items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '9', scope: 'global' }],
          })
        ),
      getAssetDefinitions: vi.fn().mockRejectedValue(new Error('definitions_down')),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '7', network: 'Taira' }]);

    expect(existingGroup.balances[0]).toMatchObject({ state: APIItemState.ERROR, total: '7' });
    warn.mockRestore();
  });

  it('fails an incomplete definition snapshot closed and keeps the prior balance stale', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const existingGroup = {
      balances: [{ id: TAIRA_XOR_ASSET_ID, name: 'Taira', state: APIItemState.READY, symbol: 'XOR', total: '7' }],
      groupId: TAIRA_XOR_ASSET_ID,
      icon: 'xor',
      mainNetwork: 'Taira',
      priceId: 'XOR',
      providers: [],
      relayChain: 'iroha',
      symbol: 'XOR',
      tokenName: 'XOR',
    } as TokenGroup;
    const repeatedPage = Array.from({ length: 200 }, (_, index) => ({ id: `other-${index}#wonderland` }));
    const { state } = createState([taira], { [SUBSTRATE_ADDRESS]: [existingGroup] });
    const getAssetDefinitions = vi.fn().mockResolvedValue(routeBody({ has_more: true, items: repeatedPage }));
    const client: IrohaBalanceClient = {
      getAccountAssets: vi
        .fn()
        .mockResolvedValue(
          routeBody({
            items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '9', scope: 'global' }],
          })
        ),
      getAssetDefinitions,
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '7', network: 'Taira' }]);

    expect(getAssetDefinitions.mock.calls.map(([options]) => options?.offset)).toEqual([0]);
    expect(existingGroup.balances[0]).toMatchObject({ state: APIItemState.ERROR, total: '7' });
    warn.mockRestore();
  });

  it('keeps cached Iroha balances when Torii balance reads fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const existingGroup = {
      balances: [
        {
          id: TAIRA_XOR_ASSET_ID,
          name: 'Taira',
          state: APIItemState.READY,
          symbol: 'XOR',
          total: '7',
        },
      ],
      groupId: TAIRA_XOR_ASSET_ID,
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
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        irohaAddress: TAIRA_ACCOUNT_ID,
        networks: ['taira'],
      })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '7', network: 'Taira' }]);

    expect(existingGroup.balances[0].state).toBe(APIItemState.ERROR);
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ state: APIItemState.ERROR, total: '7' }),
      SUBSTRATE_ADDRESS
    );

    warn.mockRestore();
  });

  it('does not zero cached assets when a 2xx fanout read is incomplete', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const existingGroup = {
      balances: [
        {
          id: '7YWHMfk9JZeLQPBznJqwr8fh9fUo',
          name: 'Taira',
          state: APIItemState.READY,
          symbol: 'VAL',
          total: '19',
        },
      ],
      groupId: '7YWHMfk9JZeLQPBznJqwr8fh9fUo',
      icon: 'iroha',
      mainNetwork: 'Taira',
      providers: [],
      relayChain: 'iroha',
      symbol: 'VAL',
      tokenName: 'VAL',
    } as TokenGroup;
    const { state, updateBalanceStore } = createState([taira], { [SUBSTRATE_ADDRESS]: [existingGroup] });
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockRejectedValue(new Error('iroha_torii_partial_response')),
      getAssetDefinitions: vi.fn(),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: '7YWHMfk9JZeLQPBznJqwr8fh9fUo', balance: '19', network: 'Taira' }]);

    expect(existingGroup.balances[0]).toMatchObject({ state: APIItemState.ERROR, total: '19' });
    expect(updateBalanceStore).not.toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ id: '7YWHMfk9JZeLQPBznJqwr8fh9fUo', total: '0' }),
      SUBSTRATE_ADDRESS
    );
    warn.mockRestore();
  });

  it('zeros a formerly held asset definition when a later complete page omits it', async () => {
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state, updateBalanceStore } = createState([taira]);
    const getAccountAssets = vi
      .fn()
      .mockResolvedValueOnce(
        routeBody({
          items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_VAL_ASSET_ID, quantity: '19', scope: 'global' }],
        })
      )
      .mockResolvedValueOnce(routeBody({ items: [] }));
    const client: IrohaBalanceClient = {
      getAccountAssets: getAccountAssets as IrohaBalanceClient['getAccountAssets'],
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            { id: TAIRA_VAL_ASSET_ID, metadata: { symbol: 'VAL' }, spec: { scale: 6 } },
            { id: TAIRA_XOR_ASSET_ID, metadata: { symbol: 'XOR' }, spec: { scale: 9 } },
          ],
        })
      ),
    };
    const service = new IrohaBalanceService(
      state,
      vi.fn(() => client)
    );

    await service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] });
    await service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] });

    const token = state.balanceService.balanceMap[SUBSTRATE_ADDRESS].find(
      ({ groupId }) => groupId === TAIRA_VAL_ASSET_ID
    )
      ?.balances[0];
    expect(token).toMatchObject({
      id: TAIRA_VAL_ASSET_ID,
      state: APIItemState.READY,
      total: '0',
      transferable: '0',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ id: TAIRA_VAL_ASSET_ID, state: APIItemState.READY, total: '0' }),
      SUBSTRATE_ADDRESS
    );
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

  it('rejects Iroha network descriptors without an exact registry chain id', async () => {
    const unknown = irohaNetwork('Taira', 'taira-like-but-unknown');
    const { state } = createState([unknown]);
    const clientFactory = vi.fn();
    const service = new IrohaBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        irohaAddress: TAIRA_ACCOUNT_ID,
        networks: ['Taira'],
      })
    ).rejects.toThrow('unsupported_iroha_chain_id:taira-like-but-unknown');
    expect(clientFactory).not.toHaveBeenCalled();
  });
});

describe('BalanceService Iroha routing', () => {
  it('routes Iroha wallet balance refreshes to IrohaBalanceService', async () => {
    const state = { networkService: {}, timeoutService: {} } as unknown as State;
    const balanceService = new BalanceService(state);
    const fetchBalance = vi.fn().mockResolvedValue([{ assetId: TAIRA_XOR_ASSET_ID, balance: '1', network: 'Taira' }]);

    balanceService.irohaBalanceService = { fetchBalance } as never;

    await expect(
      balanceService.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        ethereumAddress: '',
        irohaAddress: TAIRA_ACCOUNT_ID,
        irohaNetworks: ['taira'],
        walletEcosystem: WalletEcosystem.Iroha,
      })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '1', network: 'Taira' }]);

    expect(fetchBalance).toHaveBeenCalledWith({
      address: SUBSTRATE_ADDRESS,
      irohaAddress: TAIRA_ACCOUNT_ID,
      networks: ['taira'],
    });
  });
});
