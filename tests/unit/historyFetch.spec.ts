import { buildHistoryFetchRequest, getHistoryEndpoint } from '@/history/fetchingHistory';
import type { NetworkJson } from '@extension-base/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { APIItemState } from '@extension-base/api/types/networks';

describe('history fetching helpers', () => {
  const createNetwork = (overrides: Partial<NetworkJson> = {}): NetworkJson =>
    ({
      name: 'Polkadot',
      chainId: '0x01',
      addressPrefix: 0,
      nodes: [],
      icon: '',
      active: true,
      favorite: [],
      providers: {},
      currentProvider: '',
      customNodes: [],
      ecosystem: 'substrate',
      externalApi: {
        history: { type: 'subquery', url: 'https://history' },
        staking: { type: 'stakingSubquery', url: 'https://staking' },
        pricing: { type: 'subquery', url: '' },
      },
      assets: [{ id: 'dot', isUtility: true }] as unknown as NetworkJson['assets'],
      ...overrides,
    }) as unknown as NetworkJson;

  const sampleToken = (overrides = {}): TokenGroup =>
    ({
      groupId: 'dot-group',
      balances: [
        {
          id: 'dot',
          isUtility: true,
          precision: 10,
          state: APIItemState.READY,
          networkName: 'Polkadot',
          transferable: '1',
        },
      ],
      ...overrides,
    }) as unknown as TokenGroup;

  it('prefers staking endpoint when available', () => {
    const network = createNetwork();

    const endpoint = getHistoryEndpoint(network);

    expect(endpoint).toEqual({ type: 'stakingSubquery', url: 'https://staking' });
  });

  it('builds a history request when asset and endpoint are valid', () => {
    const network = createNetwork();
    const endpoint = getHistoryEndpoint(network)!;
    const request = buildHistoryFetchRequest({
      network,
      assetId: 'dot-group',
      balances: [sampleToken()],
      endpoint,
      wallet: { raw: '5abc', formatted: '5abc' },
    });

    expect(request).not.toBeNull();
    expect(request?.asset.id).toBe('dot');
    expect(request?.endpoint.type).toBe('stakingSubquery');
  });

  it('allows non-utility assets only for etherscan histories or Sora networks', () => {
    const network = createNetwork({
      name: 'Ethereum',
      ecosystem: 'ethereum',
      externalApi: {
        history: { type: 'etherscan', url: 'https://etherscan' },
        pricing: { type: 'subquery', url: '' },
      },
      assets: [{ id: '0x123', isUtility: false }] as unknown as NetworkJson['assets'],
    });
    const endpoint = getHistoryEndpoint(network)!;
    const token = sampleToken({
      groupId: 'token-group',
      balances: [
        {
          id: '0x123',
          isUtility: false,
          precision: 18,
          state: APIItemState.READY,
          networkName: 'Ethereum',
          transferable: '1',
        },
      ],
    });

    const request = buildHistoryFetchRequest({
      network,
      assetId: '0x123',
      balances: [token],
      endpoint,
      wallet: { raw: '0xabc', formatted: '0xabc' },
    });

    expect(request).not.toBeNull();
    expect(request?.asset.isUtility).toBe(false);
  });

  it('returns null when non-utility assets attempt non-etherscan histories', () => {
    const network = createNetwork();
    const endpoint = getHistoryEndpoint(network)!;
    const token = sampleToken({
      groupId: 'alt-token',
      balances: [
        {
          id: 'alt-token',
          isUtility: false,
          precision: 12,
          state: APIItemState.READY,
          networkName: 'Polkadot',
          transferable: '1',
        },
      ],
    });

    const request = buildHistoryFetchRequest({
      network,
      assetId: 'alt-token',
      balances: [token],
      endpoint,
      wallet: { raw: '5abc', formatted: '5abc' },
    });

    expect(request).toBeNull();
  });
});
