import { APIItemState } from '@extension-base/api/types/networks';
import BitcoinBalanceService from '@extension-base/services/balance-service/BitcoinBalanceService';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { BitcoinAddressBalance } from '@extension-base/services/bitcoin-indexer-service';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';

const MAINNET_ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu';
const TESTNET_ADDRESS = 'tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl';
const SUBSTRATE_ADDRESS = 'substrate-address';
const MNEMONIC = vectors.vectors[0].mnemonic;

const bitcoinNetwork = (name: string, chainId: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [
      {
        color: '#f7931a',
        icon: 'bitcoin',
        id: 'BTC',
        isNative: true,
        isUtility: true,
        name: 'Bitcoin',
        precision: 8,
        priceId: 'BTC',
        providers: [],
        staking: '',
        symbol: 'BTC',
        tonType: 'normal',
        type: 'bitcoin',
      },
    ],
    chain: name,
    chainId,
    currentProvider: 'indexer',
    customNodes: [],
    disabled: false,
    ecosystem: 'bitcoin',
    favorite: [],
    genesisHash: chainId,
    icon: 'bitcoin',
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

const balance = (totalSats: number): BitcoinAddressBalance => ({
  confirmedSats: totalSats,
  mempoolSats: 0,
  totalSats,
});

const addressStats = (address: string, txCount = 0, totalSats = 0) => ({
  address,
  chain_stats: {
    funded_txo_count: txCount,
    funded_txo_sum: totalSats,
    spent_txo_count: 0,
    spent_txo_sum: 0,
    tx_count: txCount,
  },
  mempool_stats: {
    funded_txo_count: 0,
    funded_txo_sum: 0,
    spent_txo_count: 0,
    spent_txo_sum: 0,
    tx_count: 0,
  },
});

const createState = (networks: NetworkJson[], balanceMap: Record<string, TokenGroup[]> = {}) => {
  const deleteBalanceStore = vi.fn();
  const updateBalanceStore = vi.fn();
  const publishBalance = vi.fn();
  const networkMap = networks.reduce<Record<string, NetworkJson>>((result, network) => {
    result[network.name] = network;

    return result;
  }, {});
  const state = {
    balanceService: {
      balanceMap,
      deleteBalanceStore,
      publishBalance,
      updateBalanceStore,
    },
    networkService: {
      activeNetworkByEcosystem: {
        bitcoin: networks,
      },
      networkMap,
    },
    timeoutService: {
      lazyNext: (_key: string, callback: () => void) => callback(),
    },
  } as unknown as State;

  return { deleteBalanceStore, publishBalance, state, updateBalanceStore };
};

describe('BitcoinBalanceService', () => {
  it('fetches BTC from Esplora and updates the local balance map', async () => {
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const { publishBalance, state, updateBalanceStore } = createState([mainnet]);
    const client = { getBalance: vi.fn().mockResolvedValue(balance(173_456_789)) };
    const clientFactory = vi.fn(() => client);
    const service = new BitcoinBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '1.73456789', network: 'Bitcoin' }]);

    expect(clientFactory).toHaveBeenCalledWith(mainnet, 'mainnet');
    expect(client.getBalance).toHaveBeenCalledWith(MAINNET_ADDRESS);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      free: '1.73456789',
      precision: 8,
      state: APIItemState.READY,
      symbol: 'BTC',
      total: '1.73456789',
      type: 'bitcoin',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Bitcoin',
      expect.objectContaining({ total: '1.73456789' }),
      SUBSTRATE_ADDRESS
    );
    expect(publishBalance).toHaveBeenCalled();
  });

  it('aggregates discovered receive-index and change-branch balances and publishes derivation descriptors', async () => {
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const { state } = createState([mainnet]);
    const receive0 = deriveBitcoinReceiveAddress({ mnemonicOrSeed: MNEMONIC, path: getBitcoinReceivePath('mainnet', 0) });
    const receive2 = deriveBitcoinReceiveAddress({ mnemonicOrSeed: MNEMONIC, path: getBitcoinReceivePath('mainnet', 2) });
    const change1 = deriveBitcoinReceiveAddress({
      mnemonicOrSeed: MNEMONIC,
      path: getBitcoinReceivePath('mainnet', 1, 1),
    });
    const activity = new Map([
      [receive0, { balance: 0, txCount: 1 }],
      [receive2, { balance: 1_000, txCount: 1 }],
      [change1, { balance: 2_000, txCount: 1 }],
    ]);
    const client = {
      getAddress: vi.fn(async (address: string) => {
        const item = activity.get(address);

        return addressStats(address, item?.txCount ?? 0, item?.balance ?? 0);
      }),
      getBalance: vi.fn(),
    };
    const exportMnemonic = vi.fn(() => ({ seed: MNEMONIC }));
    state.keyringService = {
      exportMnemonic,
      getAllAccounts: vi.fn(() => [
        {
          address: SUBSTRATE_ADDRESS,
          meta: {
            bitcoinAddress: MAINNET_ADDRESS,
            walletEcosystem: 'substrate',
          },
        },
      ]),
    } as never;
    const service = new BitcoinBalanceService(state, vi.fn(() => client), { gapLimit: 2, maxLookahead: 20 });

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0.00003', network: 'Bitcoin' }]);

    expect(client.getBalance).not.toHaveBeenCalled();
    expect(client.getAddress).toHaveBeenCalledTimes(9);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      bitcoinAddresses: expect.arrayContaining([
        { address: receive2, change: 0, index: 2, path: "m/84'/0'/0'/0/2" },
        { address: change1, change: 1, index: 1, path: "m/84'/0'/0'/1/1" },
      ]),
      bitcoinNextChangeAddress: deriveBitcoinReceiveAddress({
        mnemonicOrSeed: MNEMONIC,
        path: getBitcoinReceivePath('mainnet', 2, 1),
      }),
      bitcoinNextChangePath: "m/84'/0'/0'/1/2",
      bitcoinNextReceiveAddress: deriveBitcoinReceiveAddress({
        mnemonicOrSeed: MNEMONIC,
        path: getBitcoinReceivePath('mainnet', 3),
      }),
      bitcoinNextReceivePath: "m/84'/0'/0'/0/3",
      total: '0.00003',
    });

    exportMnemonic.mockReturnValue({ seed: '' });
    let activeBalanceRequests = 0;
    let maxActiveBalanceRequests = 0;
    client.getBalance.mockImplementation(async (address: string) => {
      activeBalanceRequests += 1;
      maxActiveBalanceRequests = Math.max(maxActiveBalanceRequests, activeBalanceRequests);
      await Promise.resolve();
      activeBalanceRequests -= 1;

      return balance(activity.get(address)?.balance ?? 0);
    });

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0.00003', network: 'Bitcoin' }]);
    expect(client.getAddress).toHaveBeenCalledTimes(9);
    expect(client.getBalance).toHaveBeenCalledTimes(9);
    expect(maxActiveBalanceRequests).toBe(8);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      bitcoinNextChangePath: "m/84'/0'/0'/1/2",
      bitcoinNextReceivePath: "m/84'/0'/0'/0/3",
      total: '0.00003',
    });

    const storedBalance = state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0] as unknown as {
      bitcoinAddresses?: Array<{ address: string; change: number; index: number; path: string }>;
    };
    const storedRoot = storedBalance.bitcoinAddresses?.find(({ change, index }) => change === 0 && index === 0);

    if (!storedRoot) throw new Error('Expected stored BIP84 root descriptor');
    storedRoot.address = receive2;
    client.getBalance.mockClear();
    client.getBalance.mockResolvedValue(balance(7));

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0.00000007', network: 'Bitcoin' }]);
    expect(client.getBalance).toHaveBeenCalledOnce();
    expect(client.getBalance).toHaveBeenCalledWith(MAINNET_ADDRESS);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).not.toHaveProperty('bitcoinAddresses');
  });

  it('routes selected testnet balance reads to a testnet client', async () => {
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const testnet = bitcoinNetwork('Bitcoin Testnet', 'bitcoin:testnet');
    const { state } = createState([mainnet, testnet]);
    const client = { getBalance: vi.fn().mockResolvedValue(balance(1)) };
    const clientFactory = vi.fn(() => client);
    const service = new BitcoinBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        bitcoinTestnetAddress: TESTNET_ADDRESS,
        networks: ['bitcoin testnet'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0.00000001', network: 'Bitcoin Testnet' }]);

    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(clientFactory).toHaveBeenCalledWith(testnet, 'testnet');
    expect(client.getBalance).toHaveBeenCalledWith(TESTNET_ADDRESS);
  });

  it('uses distinct mainnet and testnet addresses when both Bitcoin networks are active', async () => {
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const testnet = bitcoinNetwork('Bitcoin Testnet', 'bitcoin:testnet');
    const { state } = createState([mainnet, testnet]);
    const mainnetClient = { getBalance: vi.fn().mockResolvedValue(balance(200_000_000)) };
    const testnetClient = { getBalance: vi.fn().mockResolvedValue(balance(300_000_000)) };
    const clientFactory = vi.fn((_network, bitcoinNetwork) =>
      bitcoinNetwork === 'testnet' ? testnetClient : mainnetClient
    );
    const service = new BitcoinBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        bitcoinTestnetAddress: TESTNET_ADDRESS,
      })
    ).resolves.toEqual([
      { assetId: 'BTC', balance: '2', network: 'Bitcoin' },
      { assetId: 'BTC', balance: '3', network: 'Bitcoin Testnet' },
    ]);

    expect(mainnetClient.getBalance).toHaveBeenCalledWith(MAINNET_ADDRESS);
    expect(testnetClient.getBalance).toHaveBeenCalledWith(TESTNET_ADDRESS);
  });

  it('reuses the pending mock BTC group instead of creating a duplicate', async () => {
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const existingGroup = {
      balances: [
        {
          icon: 'bitcoin',
          id: 'BTC',
          name: 'bitcoin',
          precision: 8,
          state: APIItemState.PENDING,
          symbol: 'BTC',
          type: 'bitcoin',
        },
      ],
      groupId: 'BTC',
      icon: 'bitcoin',
      mainNetwork: 'Bitcoin',
      priceId: 'BTC',
      providers: [],
      relayChain: 'Bitcoin',
      symbol: 'BTC',
      tokenName: 'BTC',
    } as unknown as TokenGroup;
    const { state } = createState([mainnet], { [SUBSTRATE_ADDRESS]: [existingGroup] });
    const client = { getBalance: vi.fn().mockResolvedValue(balance(100_000_000)) };
    const service = new BitcoinBalanceService(state, vi.fn(() => client));

    await service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      bitcoinAddress: MAINNET_ADDRESS,
      networks: ['Bitcoin'],
    });

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS]).toHaveLength(1);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0]).toMatchObject({
      relayChain: 'bitcoin',
      balances: [expect.objectContaining({ name: 'Bitcoin', state: APIItemState.READY, total: '1' })],
    });
  });

  it('marks the network errored and avoids fetch when address and network are incompatible', async () => {
    const testnet = bitcoinNetwork('Bitcoin Testnet', 'bitcoin:testnet');
    const { deleteBalanceStore, state, updateBalanceStore } = createState([testnet]);
    const clientFactory = vi.fn();
    const service = new BitcoinBalanceService(state, clientFactory);

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin Testnet'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0', network: 'Bitcoin Testnet' }]);

    expect(clientFactory).not.toHaveBeenCalled();
    expect(deleteBalanceStore).toHaveBeenCalledWith('Bitcoin Testnet', { id: 'BTC' }, SUBSTRATE_ADDRESS);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      total: '0',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Bitcoin Testnet',
      expect.objectContaining({ state: APIItemState.ERROR, total: '0' }),
      SUBSTRATE_ADDRESS
    );
  });

  it('marks BTC errored when the indexer balance lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const { state } = createState([mainnet]);
    const client = { getBalance: vi.fn().mockRejectedValue(new Error('indexer unavailable')) };
    const service = new BitcoinBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0', network: 'Bitcoin' }]);

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      symbol: 'BTC',
      total: '0',
    });

    warn.mockRestore();
  });

  it('keeps cached BTC visible when the indexer balance lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const cachedGroup = {
      balances: [
        {
          address: SUBSTRATE_ADDRESS,
          free: '1.25',
          id: 'BTC',
          mainNetwork: 'Bitcoin',
          name: 'Bitcoin',
          precision: 8,
          state: APIItemState.READY,
          symbol: 'BTC',
          total: '1.25',
          transferable: '1.25',
          type: 'bitcoin',
        },
      ],
      groupId: 'BTC',
      icon: 'bitcoin',
      mainNetwork: 'Bitcoin',
      priceId: 'BTC',
      providers: [],
      relayChain: 'bitcoin',
      symbol: 'BTC',
      tokenName: 'BTC',
    } as unknown as TokenGroup;
    const { publishBalance, state, updateBalanceStore } = createState([mainnet], {
      [SUBSTRATE_ADDRESS]: [cachedGroup],
    });
    const client = { getBalance: vi.fn().mockRejectedValue(new Error('indexer unavailable')) };
    const service = new BitcoinBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '1.25', network: 'Bitcoin' }]);

    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      total: '1.25',
      type: 'bitcoin',
    });
    expect(updateBalanceStore).toHaveBeenCalledWith(
      'Bitcoin',
      expect.objectContaining({ state: APIItemState.ERROR, total: '1.25' }),
      SUBSTRATE_ADDRESS
    );
    expect(publishBalance).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('invalidates cached discovery descriptors when stored seed material no longer matches the wallet root', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mainnet = bitcoinNetwork('Bitcoin', 'bitcoin:mainnet');
    const cachedGroup = {
      balances: [
        {
          address: SUBSTRATE_ADDRESS,
          bitcoinAddresses: [
            {
              address: MAINNET_ADDRESS,
              change: 0,
              index: 0,
              path: getBitcoinReceivePath('mainnet', 0),
            },
          ],
          bitcoinNextReceiveAddress: MAINNET_ADDRESS,
          free: '1.25',
          id: 'BTC',
          mainNetwork: 'Bitcoin',
          name: 'Bitcoin',
          precision: 8,
          state: APIItemState.READY,
          symbol: 'BTC',
          total: '1.25',
          transferable: '1.25',
          type: 'bitcoin',
        },
      ],
      groupId: 'BTC',
      icon: 'bitcoin',
      mainNetwork: 'Bitcoin',
      priceId: 'BTC',
      providers: [],
      relayChain: 'bitcoin',
      symbol: 'BTC',
      tokenName: 'BTC',
    } as unknown as TokenGroup;
    const { state } = createState([mainnet], { [SUBSTRATE_ADDRESS]: [cachedGroup] });
    const client = { getAddress: vi.fn(), getBalance: vi.fn().mockResolvedValue(balance(7)) };
    const deleteBalanceStore = vi.fn();

    state.balanceService.deleteBalanceStore = deleteBalanceStore;

    state.keyringService = {
      exportMnemonic: vi.fn(() => ({ seed: vectors.vectors[1].mnemonic })),
      getAllAccounts: vi.fn(() => [
        {
          address: SUBSTRATE_ADDRESS,
          meta: { bitcoinAddress: MAINNET_ADDRESS, walletEcosystem: 'substrate' },
        },
      ]),
    } as never;

    const service = new BitcoinBalanceService(state, vi.fn(() => client));

    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([{ assetId: 'BTC', balance: '0.00000007', network: 'Bitcoin' }]);
    expect(client.getAddress).not.toHaveBeenCalled();
    expect(client.getBalance).toHaveBeenCalledOnce();
    expect(client.getBalance).toHaveBeenCalledWith(MAINNET_ADDRESS);
    expect(deleteBalanceStore).not.toHaveBeenCalled();
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.READY,
      total: '0.00000007',
    });
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).not.toHaveProperty(
      'bitcoinAddresses'
    );
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).not.toHaveProperty(
      'bitcoinNextReceiveAddress'
    );

    let finishDeletion: (() => void) | undefined;
    const deletion = new Promise<void>((resolve) => {
      finishDeletion = resolve;
    });
    let settled = false;

    deleteBalanceStore.mockReturnValue(deletion);
    client.getBalance.mockRejectedValue(new Error('indexer unavailable'));
    const failedFallback = service.fetchBalance({
      address: SUBSTRATE_ADDRESS,
      bitcoinAddress: MAINNET_ADDRESS,
      networks: ['Bitcoin'],
    }).finally(() => {
      settled = true;
    });

    await vi.waitFor(() =>
      expect(deleteBalanceStore).toHaveBeenCalledWith('Bitcoin', { id: 'BTC' }, SUBSTRATE_ADDRESS)
    );
    expect(settled).toBe(false);
    finishDeletion?.();
    await expect(failedFallback).resolves.toEqual([{ assetId: 'BTC', balance: '0', network: 'Bitcoin' }]);
    expect(state.balanceService.balanceMap[SUBSTRATE_ADDRESS][0].balances[0]).toMatchObject({
      state: APIItemState.ERROR,
      total: '0',
    });

    warn.mockRestore();
  });

  it('does not fetch without a wallet address or a known Bitcoin network', async () => {
    const { state } = createState([]);
    const clientFactory = vi.fn();
    const service = new BitcoinBalanceService(state, clientFactory);

    await expect(service.fetchBalance({ address: undefined, networks: ['Bitcoin'] })).resolves.toEqual([]);
    await expect(
      service.fetchBalance({
        address: SUBSTRATE_ADDRESS,
        bitcoinAddress: MAINNET_ADDRESS,
        networks: ['Bitcoin'],
      })
    ).resolves.toEqual([]);
    expect(clientFactory).not.toHaveBeenCalled();
  });
});
