jest.mock('ethers', () => ({}));

(global as unknown as { chrome: unknown }).chrome = {
  runtime: {
    connect: jest.fn(() => ({
      onDisconnect: { addListener: jest.fn() },
      onMessage: { addListener: jest.fn() },
    })),
  },
};

import type { NetworkJson } from '@extension-base/types';
import type { History } from '@/stores/networks/types';
import { useStakingStore } from '@/stores/staking';
import { useNetworksStore } from '@/stores/networks';
import { normalizeNetworkName } from '@/helpers/networkGroups';
import { initTestingStores } from '@/stores/setup';

const createAsset = (id: string, overrides: Partial<NetworkJson['assets'][number]> = {}) =>
  ({
    id,
    type: 'normal',
    name: id.toUpperCase(),
    symbol: id.toUpperCase(),
    currencyId: id.toUpperCase(),
    precision: 12,
    priceId: id.toLowerCase(),
    icon: `${id}.svg`,
    color: '#000000',
    staking: 'substrate',
    isUtility: true,
    tonType: 'normal',
    ...overrides,
  }) as NetworkJson['assets'][number];

const createNetwork = (name: string, overrides: Partial<NetworkJson> = {}): NetworkJson => ({
  key: name.toLowerCase(),
  chain: name,
  icon: `${name}.svg`,
  active: true,
  providers: { default: 'wss://example' },
  currentProvider: 'wss://example',
  genesisHash: `0x${name}`,
  ss58Format: 0,
  disabled: false,
  chainId: `0x${name}`,
  name,
  externalApi: {
    staking: { url: `https://staking.${name.toLowerCase()}`, type: 'stakingSubsquid' },
    history: { url: `https://history.${name.toLowerCase()}`, type: 'stakingSubsquid' },
    pricing: { url: `https://pricing.${name.toLowerCase()}`, type: 'subquery' },
    explorers: [],
  },
  assets: [createAsset(name.toLowerCase())],
  customNodes: [],
  nodes: [{ name: 'Default', url: 'wss://example' }],
  addressPrefix: 0,
  ecosystem: 'substrate',
  types: { url: '', name: '' },
  favorite: [],
  ...overrides,
});

describe('staking store network sync', () => {
  beforeEach(() => {
    initTestingStores();
  });

  it('derives staking networks from network metadata', () => {
    const stakingStore = useStakingStore();
    const getStakingParamsSpy = jest.spyOn(stakingStore, 'getStakingParams').mockResolvedValue(undefined);
    const soraNetwork = createNetwork('Sora', {
      assets: [
        createAsset('xor', {
          name: 'SORA',
          symbol: 'XOR',
          icon: 'xor.svg',
          staking: 'sora',
        }),
      ],
    });
    const polkadotNetwork = createNetwork('Polkadot', {
      assets: [
        createAsset('dot', {
          name: 'Polkadot',
          symbol: 'DOT',
          icon: 'dot.svg',
        }),
      ],
    });

    stakingStore.syncStakingNetworks([soraNetwork, polkadotNetwork]);

    expect(stakingStore.allStakingNetworks).toHaveLength(2);
    const polkadot = stakingStore.allStakingNetworks.find(
      (item: (typeof stakingStore.allStakingNetworks)[number]) => item.network === 'Polkadot'
    );
    expect(polkadot?.assetId).toBe('dot');
    expect(polkadot?.asset).toBe('DOT');
    expect(polkadot?.icon).toBe('dot.svg');
    expect(getStakingParamsSpy).toHaveBeenCalledTimes(1);
    getStakingParamsSpy.mockRestore();
  });

  it('retains existing staking state when syncing updates', () => {
    const stakingStore = useStakingStore();
    const getStakingParamsSpy = jest.spyOn(stakingStore, 'getStakingParams').mockResolvedValue(undefined);
    const polkadotNetwork = createNetwork('Polkadot');

    stakingStore.syncStakingNetworks([polkadotNetwork]);
    expect(getStakingParamsSpy).toHaveBeenCalledTimes(1);
    getStakingParamsSpy.mockClear();
    stakingStore.allStakingNetworks[0] = {
      ...stakingStore.allStakingNetworks[0],
      totalStake: '42',
      transferableAmount: '10',
    } as (typeof stakingStore.allStakingNetworks)[number];

    stakingStore.syncStakingNetworks([
      createNetwork('Polkadot', {
        assets: [
          createAsset('dot', {
            symbol: 'DOT',
            icon: 'updated-dot.svg',
          }),
        ],
      }),
    ]);

    expect(stakingStore.allStakingNetworks[0].totalStake).toBe('42');
    expect(stakingStore.allStakingNetworks[0].transferableAmount).toBe('10');
    expect(stakingStore.allStakingNetworks[0].icon).toBe('updated-dot.svg');
    expect(getStakingParamsSpy).not.toHaveBeenCalled();
    getStakingParamsSpy.mockRestore();
  });

  it('exposes service type metadata through getStakingHistory', () => {
    const stakingStore = useStakingStore();
    const networksStore = useNetworksStore();
    const polkadotNetwork = createNetwork('Polkadot');

    networksStore.setNetworks({ networks: [polkadotNetwork] });

    const normalized = normalizeNetworkName(polkadotNetwork.name);
    const nodes = [
      {
        id: '1',
        timestamp: '123',
        address: 'addr1',
        success: true,
        transfer: {
          amount: '10',
          from: 'addr1',
          to: 'addr2',
          fee: '1',
        },
      },
    ];

    networksStore.$patch({
      history: {
        dot: {
          addr1: {
            [normalized]: {
              nodes,
              pageInfo: { startCursor: '', endCursor: '' },
              timestamp: Date.now(),
            },
          },
        },
      } as unknown as History,
    });

    const result = stakingStore.getStakingHistory('Polkadot', 'dot', 'addr1');

    expect(result.kind).toBe('generic');
    expect(result.serviceType).toBe('stakingSubsquid');
    expect(result.entries).toHaveLength(1);
  });

  it('records apy history samples when staking params update', () => {
    const stakingStore = useStakingStore();
    const polkadotNetwork = createNetwork('Polkadot');

    stakingStore.syncStakingNetworks([polkadotNetwork]);

    const [{ loading: _loading, insights: _insights, ...baseParams }] = stakingStore.allStakingNetworks;
    const validator = {
      address: 'validator-1',
      apy: '12',
      commission: '5',
      isActive: true,
      isInactive: false,
      isWaiting: false,
      isOversubscribed: false,
      nominators: [],
      identity: { info: {} },
      stake: { total: '0' },
      name: 'Validator 1',
      description: '',
      status: 'active',
    };

    stakingStore.updateStakingParams([
      {
        ...baseParams,
        apy: 12,
        validators: [validator],
      } as unknown as (typeof stakingStore.allStakingNetworks)[number],
    ]);

    const updatedNetwork = stakingStore.allStakingNetworks[0];

    expect(updatedNetwork.insights?.apyTrend.length).toBeGreaterThan(0);
    expect(updatedNetwork.insights?.validatorStats.active).toBe(1);
    expect(stakingStore.getApyHistory('Polkadot').length).toBeGreaterThan(0);
  });
});
