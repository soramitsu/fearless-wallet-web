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
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';

const irohaNetwork = (name: string, chainId: string): NetworkJson => {
  const isTaira = name === 'Taira';

  return ({
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
  }) as unknown as NetworkJson;
};

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
    expect(client.getAccountAssets).toHaveBeenCalledWith(TAIRA_ACCOUNT_ID, { limit: 200, offset: 0 });
    expect(client.getAssetDefinitions).toHaveBeenCalledWith({ limit: 200, offset: 0 });
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
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({ items: [{ id: TAIRA_XOR_ASSET_ID, name: 'XOR', spec: { scale } }] })
      ),
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

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

  it('paginates held assets beyond the former 500-item ceiling', async () => {
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const heldAssets = Array.from({ length: 501 }, (_, index) => ({
      account_id: TAIRA_ACCOUNT_ID,
      asset: `asset-${index}#wonderland`,
      quantity: String(index + 1),
    }));
    const getAccountAssets = vi.fn((_accountId: string, options?: { limit?: number; offset?: number }) =>
      Promise.resolve(routeBody({ items: heldAssets.slice(options?.offset ?? 0, (options?.offset ?? 0) + 200) }))
    );
    const definitions = [
      ...heldAssets.map(({ asset }) => ({ id: asset, spec: { scale: 0 } })),
      { id: TAIRA_XOR_ASSET_ID, spec: { scale: 9 } },
    ];
    const getAssetDefinitions = vi.fn((options?: { limit?: number; offset?: number }) => {
      const offset = options?.offset ?? 0;

      return Promise.resolve(routeBody({ items: definitions.slice(offset, offset + 200) }));
    });
    const client: IrohaBalanceClient = {
      getAccountAssets: getAccountAssets as IrohaBalanceClient['getAccountAssets'],
      getAssetDefinitions: getAssetDefinitions as IrohaBalanceClient['getAssetDefinitions'],
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    const result = await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      irohaAddress: TAIRA_ACCOUNT_ID,
      networks: ['taira'],
    });

    expect(result).toHaveLength(501);
    expect(getAccountAssets.mock.calls.map(([, options]) => options?.offset)).toEqual([0, 200, 400]);
    // The pinned native asset remains visible at zero even when the complete
    // held-asset page contains only non-native definitions.
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toHaveLength(502);
  });

  it('paginates definitions until metadata for a held asset beyond item 500 is found', async () => {
    const taira = irohaNetwork('Taira', TAIRA_CHAIN_ID);
    const { state } = createState([taira]);
    const definitions = Array.from({ length: 501 }, (_, index) => ({
      id: `asset-${index}#wonderland`,
      metadata: { symbol: `A${index}` },
      name: `Asset ${index}`,
      spec: { scale: index === 500 ? 9 : 6 },
    })).concat({
      id: TAIRA_XOR_ASSET_ID,
      metadata: { symbol: 'XOR' },
      name: 'XOR',
      spec: { scale: 9 },
    });
    const getAssetDefinitions = vi.fn((options?: { limit?: number; offset?: number }) => {
      const offset = options?.offset ?? 0;
      const items = definitions.slice(offset, offset + 200);

      return Promise.resolve(
        routeBody({ has_more: offset + items.length < definitions.length, items, total: definitions.length })
      );
    });
    const client: IrohaBalanceClient = {
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({
          items: [{ account_id: TAIRA_ACCOUNT_ID, asset: 'asset-500#wonderland', quantity: '123' }],
        })
      ),
      getAssetDefinitions: getAssetDefinitions as IrohaBalanceClient['getAssetDefinitions'],
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      irohaAddress: TAIRA_ACCOUNT_ID,
      networks: ['taira'],
    });

    expect(getAssetDefinitions.mock.calls.map(([options]) => options?.offset)).toEqual([0, 200, 400]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      assetMetadataSource: 'chain',
      assetMetadataTrust: 'unverified',
      id: 'asset-500#wonderland',
      precision: 9,
      state: APIItemState.READY,
      symbol: 'A500',
      total: '123',
    });
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
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({ items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '9' }] })
      ),
      getAssetDefinitions: vi.fn().mockRejectedValue(new Error('definitions_down')),
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '7', network: 'Taira' }]);

    expect(existingGroup.balances[0]).toMatchObject({ state: APIItemState.ERROR, total: '7' });
    warn.mockRestore();
  });

  it('fails a repeated definition page closed and keeps the prior balance stale', async () => {
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
      getAccountAssets: vi.fn().mockResolvedValue(
        routeBody({ items: [{ account_id: TAIRA_ACCOUNT_ID, asset: TAIRA_XOR_ASSET_ID, quantity: '9' }] })
      ),
      getAssetDefinitions,
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([{ assetId: TAIRA_XOR_ASSET_ID, balance: '7', network: 'Taira' }]);

    expect(getAssetDefinitions.mock.calls.map(([options]) => options?.offset)).toEqual([0, 200]);
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
    const service = new IrohaBalanceService(state, vi.fn(() => client));

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
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] })
    ).resolves.toEqual([
      { assetId: '7YWHMfk9JZeLQPBznJqwr8fh9fUo', balance: '19', network: 'Taira' },
    ]);

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
      .mockResolvedValueOnce(routeBody({
        items: [{ account_id: TAIRA_ACCOUNT_ID, asset: 'val#wonderland', quantity: '19' }],
      }))
      .mockResolvedValueOnce(routeBody({ items: [] }));
    const client: IrohaBalanceClient = {
      getAccountAssets: getAccountAssets as IrohaBalanceClient['getAccountAssets'],
      getAssetDefinitions: vi.fn().mockResolvedValue(
        routeBody({
          items: [
            { id: 'val#wonderland', metadata: { symbol: 'VAL' }, spec: { scale: 6 } },
            { id: TAIRA_XOR_ASSET_ID, metadata: { symbol: 'XOR' }, spec: { scale: 9 } },
          ],
        })
      ),
    };
    const service = new IrohaBalanceService(state, vi.fn(() => client));

    await service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] });
    await service.fetchBalance({ address: SUBSTRATE_ADDRESS, irohaAddress: TAIRA_ACCOUNT_ID, networks: ['taira'] });

    const token = state.balanceService.balanceMap[SUBSTRATE_ADDRESS]
      .find(({ groupId }) => groupId === 'val#wonderland')?.balances[0];
    expect(token).toMatchObject({
      id: 'val#wonderland',
      state: APIItemState.READY,
      total: '0',
      transferable: '0',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Taira',
      expect.objectContaining({ id: 'val#wonderland', state: APIItemState.READY, total: '0' }),
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
});

describe('BalanceService Iroha routing', () => {
  it('routes Iroha wallet balance refreshes to IrohaBalanceService', async () => {
    const state = { networkService: {}, timeoutService: {} } as unknown as State;
    const balanceService = new BalanceService(state);
    const fetchBalance = vi.fn().mockResolvedValue([
      { assetId: TAIRA_XOR_ASSET_ID, balance: '1', network: 'Taira' },
    ]);

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
