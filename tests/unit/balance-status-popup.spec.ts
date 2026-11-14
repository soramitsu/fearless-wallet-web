import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { APIItemState } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TokenGroup } from '@extension-base/background/types/types';
import type { NetworkJson } from '@extension-base/types';
import type { SyncState } from '@/portfolio/dashboard/syncState';
import { buildPortfolioSummary, createAssetKey } from '@/portfolio/assetIdentity';
import { balanceStatusMessages } from '@/locales/balanceStatusMessages';
import { dashboardMessages } from '@/portfolio/dashboard/messages';

vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number) => `${key}:${count}`,
  }),
}));
vi.mock('@/stores/accounts', () => ({ useAccountsStore: () => ({ fiatSymbol: '$' }) }));

import PortfolioExclusions from '@/screens/wallet&asset/wallet/PortfolioExclusions.vue';
import PortfolioHero from '@/screens/portfolio/PortfolioHero.vue';
import PortfolioSyncSheet from '@/screens/portfolio/PortfolioSyncSheet.vue';

const solana = {
  name: 'Solana', ecosystem: 'solana', chainId: 'solana:mainnet', icon: 'sol', rank: 1,
  assets: [{ id: 'sol', symbol: 'SOL', name: 'Solana', priceId: 'solana', isUtility: true }],
} as unknown as NetworkJson;
const key = (id: string) => createAssetKey({ ecosystem: 'solana', chainId: solana.chainId, assetId: id });
const balance = (id: string, overrides: Partial<BalanceItem> = {}): BalanceItem => ({
  id, name: 'Solana', symbol: id.toUpperCase(), icon: '', type: 'spl', precision: 6, total: '5', transferable: '5',
  state: APIItemState.READY, assetMetadataTrust: 'verified', assetMetadataSource: 'registry', ...overrides,
} as BalanceItem);
const groups = (balances: BalanceItem[]): TokenGroup[] =>
  balances.map((item) => ({ groupId: item.id, balances: [item], symbol: item.symbol, tokenName: item.symbol, icon: '', providers: [], mainNetwork: 'Solana', relayChain: 'solana' as never }));

describe('tokens found that are not verified', () => {
  const found = (id: string) => balance(id, { assetMetadataTrust: 'unverified', assetMetadataSource: 'indexer' });
  const summary = (preferences = {}) =>
    buildPortfolioSummary({
      groups: groups([balance('sol'), found('mint-a'), found('mint-b'), balance('empty', { assetMetadataTrust: 'unverified', total: '0', transferable: '0' })]),
      networks: [solana],
      prices: { solana: 100 },
      preferences,
      addressForNetwork: () => 'owner',
    });

  it('counts the funded ones the list leaves out, never in the total', () => {
    expect(summary()).toMatchObject({ total: '500', unverifiedHeldCount: 2 });
  });

  it('does not count one the owner added to the list or hid', () => {
    expect(summary({ [key('mint-a')]: 'shown', [key('mint-b')]: 'hidden' }).unverifiedHeldCount).toBe(0);
  });

  it('names how many there are under the list, and opens them for review', async () => {
    const footer = mount(PortfolioExclusions, { props: { hiddenCount: 0, unpricedCount: 0, poolStakesExcluded: false, unverifiedCount: 2 } });

    const review = footer.get('[data-testid="unverifiedNotListed"]');
    expect(review.text()).toBe('balanceStatus.foundNotVerified:2');
    await review.trigger('click');
    expect(footer.emitted('reviewUnverified')).toHaveLength(1);

    const none = mount(PortfolioExclusions, { props: { hiddenCount: 0, unpricedCount: 0, poolStakesExcluded: false, unverifiedCount: 0 } });
    expect(none.find('[data-testid="portfolioExclusions"]').exists()).toBe(false);
  });
});

describe('the balance status in the header', () => {
  const hero = (sync: Pick<SyncState, 'kind'> & Partial<SyncState>) =>
    mount(PortfolioHero, {
      props: {
        total: '10', changeAmount: '0', changePercent: '0', caption: '', hiddenCount: 0, unpricedCount: 0, unavailableCount: 0,
        poolStakesExcluded: false, loading: false, showSwap: false, sync: { savedWallets: [], staleNetworks: [], pendingNetworks: [], ...sync },
      },
      global: { stubs: { Icon: true, Shimmer: true, RoundActions: true } },
    });

  it('says the wallet is updating, not live, while its networks are still answering', () => {
    const chip = hero({ kind: 'updating', pendingNetworks: ['Kusama'] }).get('[data-testid="heroSync"]');

    expect(chip.text()).toBe('portfolioDashboard.sync.updating');
    expect(chip.classes()).toContain('sync-chip--updating');
  });

  it('lists the networks still answering in the status sheet', () => {
    const sheet = mount(PortfolioSyncSheet, {
      props: { refreshing: false, state: { kind: 'updating', savedWallets: [], staleNetworks: [], pendingNetworks: ['Kusama', 'Acala'] } },
      global: { stubs: { PortfolioSheet: { template: '<section><slot /></section>' } } },
    });

    expect(sheet.findAll('[data-testid="syncPendingNetworks"] li').map((item) => item.text())).toEqual(['Kusama', 'Acala']);
    expect(sheet.get('[data-testid="syncExplain"]').text()).toBe('portfolioDashboard.sync.updatingText');
    expect(sheet.find('[data-testid="syncNetworks"]').exists()).toBe(false);
  });

  it('calls them not responding once the wait is over', () => {
    const sheet = mount(PortfolioSyncSheet, {
      props: { refreshing: false, state: { kind: 'live', savedWallets: [], staleNetworks: [], pendingNetworks: ['Clover'] } },
      global: { stubs: { PortfolioSheet: { template: '<section><slot /></section>' } } },
    });

    expect(sheet.get('#sync-pending').text()).toBe('portfolioDashboard.sync.notResponding');
    expect(sheet.findAll('[data-testid="syncPendingNetworks"] li').map((item) => item.text())).toEqual(['Clover']);
  });

  it('has every new message in English and Russian', () => {
    const en = dashboardMessages['en-EN'].sync as Record<string, string>;
    const ru = dashboardMessages['ru-RU'].sync as Record<string, string>;

    for (const name of ['updating', 'updatingText', 'pendingNetworks', 'notResponding']) {
      expect(en[name]).toBeTruthy();
      expect(ru[name]).toBeTruthy();
    }
    expect(Object.keys(balanceStatusMessages['ru-RU'].balanceStatus)).toEqual(Object.keys(balanceStatusMessages['en-EN'].balanceStatus));
  });
});
