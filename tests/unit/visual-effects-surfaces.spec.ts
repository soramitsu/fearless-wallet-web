import { mount } from '@vue/test-utils';
import { defineComponent, nextTick } from 'vue';
import { createMemoryHistory, createRouter, type RouteLocationRaw } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/router/helpers', () => ({
  getStakingNetwork: vi.fn(),
  haveAuthRequests: vi.fn(),
  haveMetaRequests: vi.fn(),
  hasSelectedWallet: vi.fn(),
  haveSignRequests: vi.fn(() => true),
}));
// App.vue starts its subscriptions on creation; here they never answer, so only its shell renders.
vi.mock('@/extension/messaging', () => {
  const pending = () => new Promise(() => undefined);

  return {
    keyringIsLocked: vi.fn(),
    lockExtension: vi.fn(),
    pingServiceWorker: vi.fn(),
    soraFeesSubscribe: vi.fn(),
    subscribeAccounts: vi.fn(pending),
    subscribeBalance: vi.fn(pending),
    subscribeNetworkMap: vi.fn(pending),
    subscribePrice: vi.fn(pending),
    subscribeSelectedNetworks: vi.fn(pending),
  };
});
vi.mock('@/extension/messaging/nfts', () => ({ getNftSubscribe: vi.fn() }));
vi.mock('@/extension/messaging/popup', () => ({ getPopupIds: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { windows: { getCurrent: vi.fn(() => new Promise(() => undefined)) } },
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: vi.fn(() => ({ recordPortfolioLayoutFirstRun: vi.fn(), showPolkaswapAlert: false })),
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: vi.fn(() => ({})) }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: vi.fn(() => ({})) }));
vi.mock('@/stores/staking', () => ({ useStakingStore: vi.fn() }));
vi.mock('@/screens/welcome/Unlock.vue', () => ({ default: {} }));
vi.mock('@/screens/welcome/Welcome.vue', () => ({ default: {} }));
vi.mock('@/screens/main/Main.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/asset/Asset.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Wallet.vue', () => ({ default: {} }));
vi.mock('@/screens/accounts/AccountsLayout.vue', () => ({ default: {} }));
vi.mock('@/screens/extension-ui/DAppsAuths.vue', () => ({ default: {} }));
vi.mock('@/screens/wallet&asset/wallet/Currencies.vue', () => ({ default: {} }));

const i18n = vi.hoisted(() => ({
  t: (key: string, values?: Record<string, unknown>) => (values ? `${key} ${JSON.stringify(values)}` : key),
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: i18n.t }) }));

vi.mock('@/bootstrap/walletLock', () => ({ watchWalletLock: vi.fn(() => vi.fn()) }));
import App from '@/App.vue';
import VisualEffectsSetting from '@/screens/settings/VisualEffectsSetting.vue';
import {
  EFFECTS_MEDIA_QUERIES,
  VisualEffects,
  installVisualEffects,
  resetVisualEffectsForTests,
  type VisualEffectsOptions,
} from '@/appearance/visualEffects';

const MIRROR = 'ui_visual-effects-v1';

beforeEach(() => {
  localStorage.clear();
  resetVisualEffectsForTests();
  delete document.documentElement.dataset.fwEffects;
  delete document.documentElement.dataset.fwContrast;
});

afterEach(() => vi.clearAllMocks());

describe('Calm surfaces (design-system 2.1)', () => {
  it('marks the key, password, signing and recovery routes, and only those, as Calm', async () => {
    const { default: routes, Components } = await import('@/router/routes');
    const router = createRouter({ history: createMemoryHistory(), routes });
    const calm: RouteLocationRaw[] = [
      { name: Components.MigrationDescription },
      { name: Components.MigrationAccounts },
      { name: Components.UniversalWalletMigration },
      { name: Components.SecurityNotice },
      { name: Components.SecurityNoticeGuide },
      { name: Components.ChangePassword },
      { name: Components.Unlock },
      { name: Components.ResetWallet },
      { name: Components.AddWallet, params: { type: 'create' } },
      { name: Components.Authorize },
      { name: Components.MetaRequest },
      { name: Components.Transaction },
      { name: Components.WalletConnectAuthConfirmation },
      { name: Components.WalletConnectSignConfirmation },
      { name: Components.SettingsChangePassword },
      { name: Components.AccountAccessRecovery, query: { address: '5Grw' } },
      { name: Components.Export, params: { network: 'Polkadot' } },
      // Released URL for export still lands on a Calm screen.
      '/accounts/Polkadot/export',
    ];
    const lively: RouteLocationRaw[] = [
      { name: Components.Currencies },
      { name: Components.SendForm, params: { assetId: 'DOT', network: 'Polkadot' } },
      { name: Components.ReceiveForm, params: { assetId: 'DOT', network: 'Polkadot' } },
      { name: Components.Settings },
      { name: Components.Welcome },
    ];
    const isCalm = (target: RouteLocationRaw) => {
      let resolved = router.resolve(target);
      const redirect = resolved.matched.at(-1)?.redirect;

      if (typeof redirect === 'function') resolved = router.resolve(redirect(resolved, resolved) as RouteLocationRaw);

      return resolved.matched.some(({ meta }) => meta.calm === true);
    };

    calm.forEach((target) => expect(isCalm(target), JSON.stringify(target)).toBe(true));
    lively.forEach((target) => expect(isCalm(target), JSON.stringify(target)).toBe(false));
  });

  it('App.vue draws the backdrop as a decorative fixed layer and flattens it on Calm routes', async () => {
    const mountApp = (meta: Record<string, unknown>) =>
      mount(App, {
        global: {
          mocks: { $route: { matched: [{ meta }], name: 'Test' }, $router: { push: vi.fn() } },
          stubs: { RouterView: true, KeepAlive: false },
        },
      });

    const wallet = mountApp({ primaryNavigation: 'portfolio' });
    const backdrop = wallet.get('[data-testid="fwBackdrop"]');
    expect(backdrop.classes()).toContain('fw-backdrop');
    expect(backdrop.attributes('aria-hidden')).toBe('true');
    expect(backdrop.text()).toBe('');
    expect(wallet.classes()).not.toContain('fw-calm');

    const signing = mountApp({ calm: true });
    await nextTick();
    expect(signing.classes()).toContain('fw-calm');
    expect(signing.find('[data-testid="fwBackdrop"]').exists()).toBe(true);
  });
});

type Change = (event: { matches: boolean }) => void;

function contrastSwitch() {
  const listeners: Change[] = [];
  let matches = false;
  const matchMedia = (query: string) => ({
    get matches() {
      return query === EFFECTS_MEDIA_QUERIES.moreContrast && matches;
    },
    addEventListener: (_type: string, listener: Change) => {
      if (query === EFFECTS_MEDIA_QUERIES.moreContrast) listeners.push(listener);
    },
  });

  return {
    matchMedia: matchMedia as unknown as VisualEffectsOptions['matchMedia'],
    set: (value: boolean) => {
      matches = value;
      listeners.forEach((listener) => listener({ matches: value }));
    },
  };
}

const install = (options: VisualEffectsOptions = {}) =>
  installVisualEffects({
    device: { deviceMemory: 8, hardwareConcurrency: 8 },
    sampleFrames: undefined,
    ...options,
  });

describe('Settings → Appearance → Visual effects', () => {
  it('offers Automatic, Lite and Reduced as one native radio group with Automatic checked by default', () => {
    install();
    const wrapper = mount(VisualEffectsSetting);
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]');

    expect(wrapper.get('legend').text()).toBe('settingsPage.visualEffects.title');
    expect(radios.map((radio) => radio.element.value)).toEqual(['auto', 'lite', 'reduced']);
    expect(new Set(radios.map((radio) => radio.attributes('name'))).size).toBe(1);
    expect(radios.map((radio) => radio.element.checked)).toEqual([true, false, false]);
    radios.forEach((radio) => expect(radio.element.closest('label')?.textContent?.trim()).toMatch(/^settingsPage\./));
    expect(wrapper.get('[data-testid="visualEffectsDescription"]').text()).toBe(
      'settingsPage.visualEffects.autoDescription'
    );
    expect(wrapper.get('[data-testid="visualEffectsInUse"]').text()).toContain('settingsPage.visualEffects.full');
  });

  it('applies a choice to the page at once and remembers it for the next open', async () => {
    const effects = install();
    const wrapper = mount(VisualEffectsSetting);

    await wrapper.get('[data-testid="visualEffects-reduced"] input').setValue(true);

    expect(document.documentElement.dataset.fwEffects).toBe('reduced');
    expect(effects.state.preference).toBe('reduced');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'reduced' });
    expect(wrapper.get('[data-testid="visualEffectsDescription"]').text()).toBe(
      'settingsPage.visualEffects.reducedDescription'
    );
    expect(wrapper.get('[data-testid="visualEffectsInUse"]').text()).toContain('settingsPage.visualEffects.reduced');

    // The next popup open starts from the stored choice.
    expect(new VisualEffects({ root: document.createElement('html') }).state.preference).toBe('reduced');
  });

  it('says when the system contrast keeps effects Reduced, live', async () => {
    const system = contrastSwitch();
    install({ matchMedia: system.matchMedia });
    const wrapper = mount(VisualEffectsSetting);

    await wrapper.get('[data-testid="visualEffects-lite"] input').setValue(true);
    expect(wrapper.find('[data-testid="visualEffectsContrastNote"]').exists()).toBe(false);
    expect(document.documentElement.dataset.fwEffects).toBe('lite');

    system.set(true);
    await nextTick();
    expect(document.documentElement.dataset).toMatchObject({ fwEffects: 'reduced', fwContrast: 'high' });
    expect(wrapper.find('[data-testid="visualEffectsContrastNote"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="visualEffectsInUse"]').text()).toContain('settingsPage.visualEffects.reduced');

    // Nothing to explain once the user's own choice is Reduced.
    await wrapper.get('[data-testid="visualEffects-reduced"] input').setValue(true);
    expect(wrapper.find('[data-testid="visualEffectsContrastNote"]').exists()).toBe(false);
  });

  it('stops listening when Settings is closed', () => {
    const effects = install();
    const subscribe = vi.spyOn(effects, 'subscribe');
    const wrapper = mount(VisualEffectsSetting);
    const unsubscribe = subscribe.mock.results[0].value as () => boolean;

    wrapper.unmount();

    expect(unsubscribe()).toBe(false);
  });
});

describe('Settings page', () => {
  it('shows the Appearance section between Preferences and About', async () => {
    vi.doMock('@/locales/useI18n', () => ({ useI18n: () => ({ t: i18n.t, tc: i18n.t }) }));
    vi.doMock('@/util/releaseFeatures', () => ({ isIrohaConnectEnabled: () => false }));
    vi.doMock('vue-router', async (original) => ({
      ...(await original<typeof import('vue-router')>()),
      useRoute: () => ({ query: {} }),
      useRouter: () => ({ push: vi.fn() }),
    }));
    vi.doMock('@/extension/messaging', () => ({
      getAccessStatus: vi.fn(async () => ({ issues: [] })),
      lockExtension: vi.fn(),
    }));
    vi.doMock('@/stores/accounts', () => ({
      useAccountsStore: () => ({ accounts: [], selectedWallet: { address: '' } }),
    }));
    install();
    const { default: SettingsPage } = await import('@/screens/settings/SettingsPage.vue');
    const wrapper = mount(SettingsPage, {
      global: {
        stubs: {
          ContentForm: defineComponent({ template: '<div><slot /></div>' }),
          Scroll: defineComponent({ template: '<div><slot /></div>' }),
          Icon: true,
        },
      },
    });

    const headings = wrapper.findAll('h2').map((heading) => heading.text());
    const preferences = headings.indexOf('settingsPage.groups.preferences');

    expect(headings.slice(preferences, preferences + 3)).toEqual([
      'settingsPage.groups.preferences',
      'settingsPage.groups.appearance',
      'settingsPage.groups.about',
    ]);
    expect(wrapper.find('[data-testid="visualEffectsSetting"]').exists()).toBe(true);
  });
});
