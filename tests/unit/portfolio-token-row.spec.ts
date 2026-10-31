import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { AccountJson } from '@extension-base/background/types/types';
import type { PortfolioAsset } from '@/portfolio/assetIdentity';
import type { PortfolioTokenChild, PortfolioTokenRow } from '@/portfolio/tokenLens';
import { useAccountsStore } from '@/stores/accounts';

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('vue-router', () => ({ useRouter: () => router }));
vi.mock('@/router/routes', () => ({ Components: { AssetHistory: 'AssetHistory', TokenOverview: 'TokenOverview' } }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
    tc: (key: string, count: number, values?: Record<string, unknown>) => `${key}:${count} ${JSON.stringify(values ?? {})}`,
  }),
}));
vi.mock('@/extension/messaging', () => ({ getHistory: vi.fn(), toggleFavoriteNetwork: vi.fn(), sendMessage: vi.fn() }));
vi.mock('@/extension/messaging/price', () => ({ getFiats: vi.fn() }));

import Switcher from '@/components/Switcher.vue';
import PortfolioGroupNetworkPicker from '@/screens/wallet&asset/wallet/PortfolioGroupNetworkPicker.vue';
import PortfolioTokenRowView from '@/screens/wallet&asset/wallet/PortfolioTokenRow.vue';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const asset = (networkName: string, assetId: string, balanceText: string, extra: Partial<PortfolioAsset> = {}): PortfolioAsset =>
  ({
    key: `substrate:${networkName.toLowerCase()}:${assetId}`,
    networkName,
    networkIcon: `${networkName}-icon`,
    assetId,
    name: 'Polkadot',
    symbol: 'DOT',
    icon: 'dot-icon',
    balanceText,
    transferableText: balanceText,
    hasBalance: balanceText !== '0',
    fiatValue: balanceText === '0' ? null : String(Number(balanceText) * 5),
    hidden: false,
    trust: 'verified',
    preferenceSource: 'auto',
    isTestnet: false,
    ...extra,
  }) as PortfolioAsset;

const child = (value: PortfolioAsset, role?: string): PortfolioTokenChild => ({ asset: value, role, networkRank: 1 });

const dotRow = (): PortfolioTokenRow => ({
  id: 'group:dot',
  groupId: 'dot',
  symbol: 'DOT',
  name: 'Polkadot',
  icon: 'dot-icon',
  networkIcon: 'Polkadot-icon',
  children: [child(asset('Polkadot', 'relay-dot', '10'), 'native'), child(asset('Polkadot AssetHub', 'hub-dot', '2'), 'system-parachain')],
  zeroChildren: [child(asset('Hydration', 'hydration-dot', '0'), 'xcm-reserve')],
  networkCount: 3,
  balanceText: '12',
  transferableText: '12',
  hasBalance: true,
  fiatValue: '60',
  unpricedNetworkCount: 0,
  hidden: false,
  isTestnet: false,
});

const mountRow = (row: PortfolioTokenRow, props: Record<string, unknown> = {}) =>
  mount(PortfolioTokenRowView, {
    props: { row, ...props },
    global: { stubs: { ExternalLogo: true, Icon: true, Switcher: true } },
  });

// Manage with the real switch, as a keyboard or screen-reader user meets it.
const mountManaged = (row: PortfolioTokenRow) =>
  mount(PortfolioTokenRowView, {
    props: { row, manage: true, forceExpanded: true },
    attachTo: document.body,
    global: { components: { Switcher }, stubs: { ExternalLogo: true, Icon: true } },
  });

describe('a By token row', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
    setActivePinia(createPinia());
    router.push.mockReset();
    useAccountsStore().setSelectedWallet({ address: 'wallet', ethereumAddress: '', name: 'Wallet' } as AccountJson);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('names the token, its amount, value and network count to assistive technology', () => {
    const wrapper = mountRow(dotRow());
    const header = wrapper.get('[data-testid="tokenGroupHeader"]');

    // It opens a page, not a list in place.
    expect(header.attributes('aria-expanded')).toBeUndefined();
    expect(header.attributes('aria-label')).toContain('portfolioPage.tokenGroupLabel:3');
    expect(header.attributes('aria-label')).toContain('"symbol":"DOT"');
    expect(header.attributes('aria-label')).toContain('"amount":"12.0000 DOT"');
    expect(header.attributes('aria-label')).toContain('"count":3');
    wrapper.unmount();
  });

  it('shows the price, its move and where the token is held, Exodus-style, and opens the token on its own page', async () => {
    const priced = (value: PortfolioAsset) => ({ ...value, unitPrice: '5', priceChangePercent: '-1.25' });
    const row = { ...dotRow(), children: dotRow().children.map((member) => ({ ...member, asset: priced(member.asset) })) };
    const wrapper = mountRow(row);

    expect(wrapper.get('[data-testid="tokenFiat"]').text()).toBe('60.00');
    expect(wrapper.get('[data-testid="tokenAmount"]').text()).toBe('12.0000 DOT');
    expect(wrapper.get('[data-testid="tokenPrice"]').text()).toBe('5.00');
    expect(wrapper.get('[data-testid="tokenChange"]').text()).toBe('-1.25%');
    expect(wrapper.get('[data-testid="tokenChange"]').classes()).toContain('token-change--down');
    // Held on two networks (the third is at zero and waits on the token's page): the logo counts them.
    expect(wrapper.get('[data-testid="networkCount"]').text()).toBe('2');
    expect(wrapper.get('.token-where').text()).toBe('walletHome.networks:2 {"count":2}');
    expect(wrapper.find('[data-testid="tokenNetworks"]').exists()).toBe(false);

    await wrapper.get('[data-testid="tokenGroupHeader"]').trigger('click');

    expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'TokenOverview', params: { token: 'group:dot' } });
    expect(wrapper.find('[data-testid="tokenNetworks"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('names the one network a group is held on, though its other networks are listed at zero', () => {
    const wrapper = mountRow({ ...dotRow(), children: [dotRow().children[0]], zeroChildren: [...dotRow().children.slice(1), ...dotRow().zeroChildren] });

    expect(wrapper.find('[data-testid="networkCount"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tokenNetwork"]').text()).toBe('Polkadot');
    wrapper.unmount();
  });

  it('remembers that it was opened in Manage after the popup closes', async () => {
    const wrapper = mountRow(dotRow(), { manage: true });
    await wrapper.get('[data-testid="tokenGroupHeader"]').trigger('click');
    expect(wrapper.findAll('.network-row')).toHaveLength(3);
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();

    const reopened = mountRow(dotRow(), { manage: true });
    expect(reopened.get('[data-testid="tokenGroupHeader"]').attributes('aria-expanded')).toBe('true');
    expect(JSON.parse(localStorage.getItem('account_portfolio-view-v1')!).value.wallet.expandedGroups).toEqual(['group:dot']);

    await reopened.get('[data-testid="tokenGroupHeader"]').trigger('click');
    expect(reopened.find('[data-testid="tokenNetworks"]').exists()).toBe(false);
    reopened.unmount();
  });

  it('lists every network of a group in Manage, zero ones included, each with its role', () => {
    // The Hidden filter opens every group.
    const wrapper = mountRow(dotRow(), { manage: true, forceExpanded: true });

    expect(wrapper.findAll('.network-row')).toHaveLength(3);
    expect(wrapper.find('[data-testid="tokenZeroNetworks"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="memberRole"]').map((chip) => chip.text())).toEqual([
      'portfolioPage.role.native',
      'portfolioPage.role.systemParachain',
      'portfolioPage.role.xcmReserve',
    ]);
    wrapper.unmount();
  });

  it('keeps Send and Receive for the token page, which asks for the network', () => {
    const wrapper = mountRow(dotRow());

    expect(wrapper.find('[data-testid="groupSend"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="groupReceive"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens a single-network row straight on its asset page, with the network named', async () => {
    const single: PortfolioTokenRow = {
      ...dotRow(),
      id: 'substrate:polygon:usdt',
      groupId: undefined,
      symbol: 'USDT',
      children: [child(asset('Polygon', '0xc2132', '2', { symbol: 'USDT' }))],
      zeroChildren: [],
      networkCount: 1,
    };
    const wrapper = mountRow(single);

    expect(wrapper.find('[data-testid="tokenGroupHeader"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tokenNetwork"]').text()).toBe('Polygon');
    expect(wrapper.find('[data-testid="memberRole"]').exists()).toBe(false);
    await wrapper.get('[data-testid="tokenRowHeader"]').trigger('click');
    expect(router.push).toHaveBeenCalledWith({ name: 'AssetHistory', params: { assetId: '0xc2132', selectedNetwork: 'Polygon' } });
    wrapper.unmount();
  });

  it.each([false, true])('restores only the hidden network opened from a token search (grouped %s)', async (grouped) => {
    const hidden = asset('Polkadot', 'relay-dot', '0', { hidden: true, preference: 'hidden' });
    const other = asset('Polkadot AssetHub', 'hub-dot', '0', { hidden: true, preference: 'hidden' });
    const accounts = useAccountsStore();
    accounts.setAssetPreferences({ entries: [hidden, other].map(({ key }) => ({ key, preference: 'hidden' })) });
    const row: PortfolioTokenRow = {
      ...dotRow(), groupId: grouped ? 'dot' : undefined,
      children: grouped ? [child(hidden), child(other)] : [child(hidden)], zeroChildren: [], networkCount: grouped ? 2 : 1,
    };
    const wrapper = mountRow(row, { search: 'DOT' });
    expect(accounts.assetPreferences[hidden.key]).toBe('hidden');
    await wrapper.get(grouped ? '[data-testid="tokenGroupHeader"]' : '[data-testid="tokenRowHeader"]').trigger('click');

    if (grouped) {
      // A group found by a search opens on its page with the same search, where opening a network restores only it.
      expect(accounts.assetPreferences[hidden.key]).toBe('hidden');
      expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'TokenOverview', params: { token: 'group:dot' }, query: { search: 'DOT' } });
    } else {
      expect(accounts.assetPreferences[hidden.key] ?? 'auto').toBe('auto');
      expect(router.push).toHaveBeenCalledExactlyOnceWith({ name: 'AssetHistory', params: { assetId: 'relay-dot', selectedNetwork: 'Polkadot' } });
    }
    expect(accounts.assetPreferences[other.key]).toBe('hidden');
    wrapper.unmount();
  });

  it('says a balance nobody could load failed, never "0", in the row, its networks and its label', async () => {
    const unavailable = asset('TON Mainnet', 'ton', '0', { symbol: 'TON', balanceUnavailable: true, balanceFailed: true });
    const ton: PortfolioTokenRow = {
      ...dotRow(),
      id: 'ton:-239:ton',
      groupId: undefined,
      symbol: 'TON',
      children: [child(unavailable)],
      zeroChildren: [],
      networkCount: 1,
      balanceText: '0',
      transferableText: '0',
      hasBalance: false,
      fiatValue: null,
      unavailableNetworkCount: 1,
      balanceUnavailable: true,
      balanceFailed: true,
    };
    const wrapper = mountRow(ton);

    expect(wrapper.get('[data-testid="tokenBalanceUnavailable"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(wrapper.find('[data-testid="tokenAmount"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('0.0000 TON');
    // The label says the same, with no amount and no value: neither "$0.00" nor "Price unavailable".
    expect(wrapper.get('[data-testid="tokenRowHeader"]').attributes('aria-label')).toBe(
      'portfolioPage.tokenSingleFailedLabel {"symbol":"TON","status":"portfolioPage.balanceStatus.failed","network":"TON Mainnet"}'
    );
    wrapper.unmount();

    // In a group, the failed network says so and the others keep their amounts; the row says part of it failed.
    const group = mountRow(
      {
        ...dotRow(),
        children: [...dotRow().children, child({ ...unavailable, networkName: 'Hydration', symbol: 'DOT' }, 'xcm-reserve')],
        zeroChildren: [],
        unavailableNetworkCount: 1,
        balanceUnavailable: false,
        balanceFailed: true,
      },
      { manage: true, forceExpanded: true }
    );

    expect(group.get('[data-testid="tokenAmount"]').text()).toBe('12.0000 DOT');
    expect(group.get('[data-testid="tokenBalanceFailed"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(group.findAll('[data-testid="networkBalanceUnavailable"]').map((cell) => cell.text())).toEqual([
      'portfolioPage.balanceStatus.failed',
    ]);
    // The header label keeps the known amount and says part of it failed; the failed network has no amount or value.
    const headerLabel = group.get('[data-testid="tokenGroupHeader"]').attributes('aria-label');
    expect(headerLabel).toContain('"amount":"12.0000 DOT"');
    expect(headerLabel?.endsWith(' · portfolioPage.balanceStatus.failed')).toBe(true);
    expect(group.findAll('.network-row')[2].text()).not.toContain('0.0000 DOT');
    group.unmount();
  });

  it('says a group failed, never "0.0000 DOT · Price unavailable", when its only member that may hold funds failed', () => {
    // As buildTokenRows makes it (token-lens.spec.ts): Polkadot not loaded, Asset Hub shown at a known 0.
    const relay = asset('Polkadot', 'relay-dot', '0', { balanceUnavailable: true, balanceFailed: true });
    const hub = asset('Polkadot AssetHub', 'hub-dot', '0');
    const wrapper = mountRow(
      {
        ...dotRow(),
        children: [child(relay, 'native'), child(hub, 'system-parachain')],
        zeroChildren: [],
        networkCount: 2,
        balanceText: '0',
        transferableText: '0',
        hasBalance: false,
        fiatValue: null,
        unavailableNetworkCount: 1,
        balanceUnavailable: true,
        balanceFailed: true,
      },
      { manage: true, forceExpanded: true }
    );
    const header = wrapper.get('[data-testid="tokenGroupHeader"]');

    expect(wrapper.get('[data-testid="tokenBalanceUnavailable"]').text()).toBe('portfolioPage.balanceStatus.failed');
    expect(header.text()).not.toContain('0.0000 DOT');
    expect(header.text()).not.toContain('portfolioPage.priceUnavailable');
    expect(header.attributes('aria-label')).toBe(
      'portfolioPage.tokenGroupFailedLabel:2 {"symbol":"DOT","status":"portfolioPage.balanceStatus.failed","count":2}'
    );
    // The network lines still say which one failed and which one holds a known 0.
    expect(wrapper.findAll('[data-testid="networkBalanceUnavailable"]')).toHaveLength(1);
    expect(wrapper.findAll('.network-row')[1].text()).toContain('0.0000 DOT');
    wrapper.unmount();
  });

  it('keeps the last confirmed amount of a failed update and marks it as out of date', () => {
    const stale = asset('Polkadot', 'relay-dot', '10', { balanceFailed: true });
    const row = { ...dotRow(), children: [child(stale, 'native'), dotRow().children[1]], balanceFailed: true };
    const wrapper = mountRow(row);

    expect(wrapper.get('[data-testid="tokenAmount"]').text()).toBe('12.0000 DOT');
    expect(wrapper.find('[data-testid="tokenBalanceUnavailable"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="tokenBalanceFailed"]').text()).toBe('portfolioPage.balanceStatus.failed');
    // Assistive technology hears the amounts and that they may be out of date, where the row shows it.
    const headerLabel = wrapper.get('[data-testid="tokenGroupHeader"]').attributes('aria-label');
    expect(headerLabel).toContain('"amount":"12.0000 DOT"');
    expect(headerLabel?.endsWith(' · portfolioPage.balanceStatus.failed')).toBe(true);
    wrapper.unmount();

    // In Manage each network says which amount is the last one confirmed.
    const managed = mountRow(row, { manage: true, forceExpanded: true });
    expect(managed.findAll('[data-testid="networkBalanceFailed"]')).toHaveLength(1);
    expect(managed.findAll('.network-row')[0].text()).toContain('10.0000 DOT');
    managed.unmount();
  });

  it('says when part of a group has no price instead of valuing it at another network’s price', () => {
    const wrapper = mountRow({ ...dotRow(), unpricedNetworkCount: 1 });
    expect(wrapper.get('[data-testid="tokenPartialPrice"]').text()).toContain('portfolioPage.priceUnavailableOn:1');
    wrapper.unmount();
  });

  it('names every Manage switch, and the group switch says it covers every network of the token', () => {
    const wrapper = mountManaged(dotRow());
    const names = wrapper.findAll('input[role="switch"]').map((toggle) => toggle.attributes('aria-label'));

    expect(names).toEqual([
      'portfolioPage.showTokenOnNetworks:3 {"symbol":"DOT","count":3}',
      'portfolioPage.showAssetOnNetwork {"symbol":"DOT","network":"Polkadot"}',
      'portfolioPage.showAssetOnNetwork {"symbol":"DOT","network":"Polkadot AssetHub"}',
      'portfolioPage.showAssetOnNetwork {"symbol":"DOT","network":"Hydration"}',
    ]);
    // In Manage the network lines are not buttons that do nothing: each switch is the one control.
    wrapper.findAll('.network-row').forEach((line) => {
      expect(line.element.tagName).toBe('DIV');
      expect(line.element.closest('button')).toBeNull();
    });
    // The group header still opens and closes its networks.
    expect(wrapper.get('[data-testid="tokenGroupHeader"]').element.tagName).toBe('BUTTON');
    wrapper.unmount();
  });

  it('shows a single-network row in Manage as a line with one named switch, not an inert button', async () => {
    const single: PortfolioTokenRow = {
      ...dotRow(),
      id: 'substrate:polygon:usdt',
      groupId: undefined,
      symbol: 'USDT',
      children: [child(asset('Polygon', '0xc2132', '2', { symbol: 'USDT', hidden: true }))],
      zeroChildren: [],
      networkCount: 1,
      hidden: true,
    };
    const wrapper = mountManaged(single);
    const header = wrapper.get('[data-testid="tokenRowHeader"]');
    const toggle = wrapper.get('input[role="switch"]');

    expect(header.element.tagName).toBe('DIV');
    expect(header.attributes('aria-label')).toBeUndefined();
    expect(toggle.attributes('aria-label')).toBe('portfolioPage.showAssetOnNetwork {"symbol":"USDT","network":"Polygon"}');
    expect((toggle.element as HTMLInputElement).checked).toBe(false);

    const setPreferences = vi.spyOn(useAccountsStore(), 'setAssetPreferences');
    (toggle.element as HTMLInputElement).focus();
    expect(document.activeElement).toBe(toggle.element);
    (toggle.element as HTMLInputElement).click();

    expect(setPreferences).toHaveBeenCalledExactlyOnceWith({ entries: [{ key: 'substrate:polygon:0xc2132', preference: 'shown' }] });
    expect(router.push).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('the network picker of a token row', () => {
  it('lists each network as "SYMBOL · Network" with what it holds, and a failed balance as failed, never 0', () => {
    const wrapper = mount(PortfolioGroupNetworkPicker, {
      props: {
        action: 'receive',
        symbol: 'DOT',
        options: [
          { key: 'polkadot', assetId: 'relay-dot', networkName: 'Polkadot', networkIcon: '', role: 'native', amountText: '10' },
          { key: 'hub', assetId: 'hub-dot', networkName: 'Polkadot AssetHub', networkIcon: '', role: 'system-parachain', balanceUnavailable: true },
          { key: 'hydration', assetId: 'hydration-dot', networkName: 'Hydration', networkIcon: '', role: 'xcm-reserve' },
        ],
      },
      attachTo: document.body,
      global: { stubs: { ExternalLogo: true, Icon: true } },
    });
    const options = [...document.body.querySelectorAll('[data-testid="groupNetworkOption"]')].map((option) => ({
      label: option.querySelector('.option-label')?.textContent?.trim(),
      amount: option.querySelector('.option-amount')?.textContent?.trim() ?? null,
    }));

    expect(options).toEqual([
      { label: 'DOT · Polkadot', amount: '10.0000 DOT' },
      { label: 'DOT · Polkadot AssetHub', amount: 'portfolioPage.balanceStatus.failed' },
      // A network the wallet holds nothing on yet: nothing is loaded, so nothing is claimed.
      { label: 'DOT · Hydration', amount: null },
    ]);
    expect(document.body.querySelector('[data-testid="groupNetworkWarning"]')?.textContent).toContain(
      'portfolioPage.groupPicker.receiveWarning'
    );
    wrapper.unmount();
  });
});
