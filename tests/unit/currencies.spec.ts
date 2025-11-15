import { APIItemState } from '@extension-base/api/types/networks';
import type { NetworkJson } from '@extension-base/types';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import { FAVORITE_NETWORKS } from '@/consts/networks';
import {
  buildFiatOptions,
  buildFiatMetadataIndex,
  createAssetTagIndex,
  createWalletMetadataIndex,
  deriveAssetTags,
  filterBalanceItemsByNetwork,
} from '@/helpers/currencies';
import { createNetworkSelectionContext } from '@/helpers/networkGroups';

jest.mock('@/stores/networks', () => ({
  useNetworksStore: jest.fn(() => ({
    networks: [],
    fiats: [],
    assetsPrice: { tokenPriceMap: {}, tokenPriceChange: {} },
    getNetwork: jest.fn(() => ({})),
    getAssetPrice: jest.fn(() => ({ price: 0, priceChange: 0, isExist: false })),
  })),
}));

jest.mock('@/stores/accounts', () => ({
  useAccountsStore: jest.fn(() => ({
    selectedWallet: {
      address: 'alice',
      isMobile: false,
      isTon: false,
      hasEthereum: true,
    },
    selectedNetwork: 'all',
    hiddenAssets: [],
    accounts: [],
    fiatSymbol: '$',
  })),
}));

describe('currencies helpers', () => {
  describe('buildFiatOptions', () => {
    it('filters fiats by name, id, or symbol', () => {
      const options = buildFiatOptions(
        [
          { id: 'usd', symbol: 'USD', name: 'US Dollar', icon: 'usd.svg' },
          { id: 'eur', symbol: 'EUR', name: 'Euro', icon: 'eur.svg' },
        ],
        'us'
      );

      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ value: 'usd', name: 'US Dollar' });

      const symbolMatch = buildFiatOptions(
        [
          { id: 'gbp', symbol: 'GBP', name: 'British Pound', icon: 'gbp.svg' },
          { id: 'chf', symbol: 'CHF', name: 'Swiss Franc', icon: 'chf.svg' },
        ],
        'chf'
      );

      expect(symbolMatch).toHaveLength(1);
      expect(symbolMatch[0]).toMatchObject({ value: 'chf', name: 'Swiss Franc' });
    });
  });

  describe('buildFiatMetadataIndex', () => {
    it('exposes lookup maps alongside filtered options', () => {
      const index = buildFiatMetadataIndex(
        [
          { id: 'usd', symbol: 'USD', name: 'US Dollar', icon: 'usd.svg' },
          { id: 'eur', symbol: 'EUR', name: 'Euro', icon: 'eur.svg' },
        ],
        'usd'
      );

      expect(index.options).toHaveLength(1);
      expect(index.options[0]).toMatchObject({ value: 'usd', symbol: 'USD' });
      expect(index.byId.get('usd')).toMatchObject({ name: 'US Dollar' });
      expect(index.bySymbol.get('usd')).toMatchObject({ value: 'usd' });
      expect(index.bySymbol.get('eur')).toMatchObject({ value: 'eur' });
    });
  });

  describe('deriveAssetTags', () => {
    it('derives normalized tags from token metadata and balances', () => {
      const token: TokenGroup = {
        mainNetwork: 'Polkadot',
        groupId: 'dot-group',
        tokenName: 'DOT',
        symbol: 'dot',
        relayChain: 'polkadot',
        icon: 'dot.svg',
        providers: [],
        balances: [
          {
            state: APIItemState.READY,
            symbol: 'dot',
            networkName: 'Polkadot',
            id: 'dot',
            precision: 10,
            type: 'substrate',
            icon: 'dot.svg',
            transferable: '10',
            isUtility: true,
            isNative: true,
          } as unknown as BalanceItem,
        ],
      };

      const tags = deriveAssetTags(token);

      expect(tags).toContain('dot');
      expect(tags).toContain('polkadot');
      expect(tags).toContain('utility');
      expect(tags).toContain('native');
    });
  });

  describe('createAssetTagIndex', () => {
    it('caches derived tags by group and matches filters', () => {
      const token: TokenGroup = {
        mainNetwork: 'Polkadot',
        groupId: 'dot-group',
        tokenName: 'DOT',
        symbol: 'dot',
        relayChain: 'polkadot',
        icon: 'dot.svg',
        providers: [],
        balances: [
          {
            state: APIItemState.READY,
            symbol: 'dot',
            networkName: 'Polkadot',
            id: 'dot',
            precision: 10,
            type: 'substrate',
            icon: 'dot.svg',
            transferable: '10',
            isUtility: true,
            isNative: true,
          } as unknown as BalanceItem,
        ],
      };

      const index = createAssetTagIndex([token]);

      expect(index.matches(token, 'utility')).toBe(true);
      const first = index.getTags(token);
      const second = index.getTags(token);

      expect(second).toBe(first);
    });
  });

  describe('filterBalanceItemsByNetwork', () => {
    it('respects the provided network selection context', () => {
      const networks: NetworkJson[] = [
        {
          name: 'Polkadot',
          favorite: ['alice'],
          chainId: '0x01',
        } as unknown as NetworkJson,
        {
          name: 'Kusama',
          favorite: [],
          chainId: '0x02',
        } as unknown as NetworkJson,
      ];

      const selection = createNetworkSelectionContext(networks, FAVORITE_NETWORKS, { favoriteAddress: 'alice' });

      const polkadotBalance = {
        state: APIItemState.READY,
        symbol: 'dot',
        networkName: 'Polkadot',
        id: 'dot',
        precision: 10,
        type: 'substrate',
        icon: 'dot.svg',
      } as unknown as BalanceItem;

      const kusamaBalance = {
        ...polkadotBalance,
        networkName: 'Kusama',
      };

      expect(filterBalanceItemsByNetwork(polkadotBalance, selection)).toBe(true);
      expect(filterBalanceItemsByNetwork(kusamaBalance, selection)).toBe(false);
    });
  });

  describe('createWalletMetadataIndex', () => {
    it('aggregates network selection, asset tags, and fiat metadata', () => {
      const networks: NetworkJson[] = [
        {
          name: 'Polkadot',
          favorite: ['alice'],
          chainId: '0x01',
        } as unknown as NetworkJson,
        {
          name: 'Kusama',
          favorite: [],
          chainId: '0x02',
        } as unknown as NetworkJson,
      ];

      const token: TokenGroup = {
        mainNetwork: 'Polkadot',
        groupId: 'dot-group',
        tokenName: 'DOT',
        symbol: 'dot',
        relayChain: 'polkadot',
        icon: 'dot.svg',
        providers: [],
        balances: [
          {
            state: APIItemState.READY,
            symbol: 'dot',
            networkName: 'Polkadot',
            id: 'dot',
            precision: 10,
            type: 'substrate',
            icon: 'dot.svg',
            transferable: '10',
            isUtility: true,
            isNative: true,
          } as unknown as BalanceItem,
        ],
      };

      const fiats = [
        { id: 'usd', symbol: 'USD', name: 'US Dollar', icon: 'usd.svg' },
        { id: 'eur', symbol: 'EUR', name: 'Euro', icon: 'eur.svg' },
      ];

      const metadata = createWalletMetadataIndex({
        tokenGroups: [token],
        fiats,
        fiatFilter: 'usd',
        networks,
        selection: 'Polkadot',
        favoriteAddress: 'alice',
      });

      expect(metadata.selection.normalizedSelection).toBe('polkadot');
      expect(metadata.assetTags.matches(token, 'utility')).toBe(true);
      expect(metadata.fiatMetadata.options).toHaveLength(1);
      expect(metadata.networkIndex.selection).toBe(metadata.selection);
    });
  });
});
