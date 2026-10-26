import { flushPromises, mount } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  isSidePanel: false,
  chrome: undefined as unknown,
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/consts/global', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/consts/global')>()),
  CONTENT_FORM_HEIGHT: 500,
  IS_EXTENSION: true,
}));
vi.mock('@/consts/globalClient', () => ({
  IS_POPUP: true,
  get IS_SIDE_PANEL() {
    return mocks.isSidePanel;
  },
}));
vi.mock('@extension-base/utils/crossenv', () => ({
  get chrome() {
    return mocks.chrome;
  },
}));
vi.mock('@/extension/messaging', () => ({
  getAccessStatus: vi.fn().mockResolvedValue({ issues: [] }),
  lockExtension: vi.fn(),
}));
vi.mock('@/extension/messaging/legacy-exposure', () => ({
  getLegacyExposureStatus: vi.fn().mockResolvedValue({ state: 'not_exposed', wallets: [], newWallets: [] }),
}));
vi.mock('@/router/routes', () => ({
  Components: new Proxy({}, { get: (_, name) => String(name) }),
}));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({ accounts: [], selectedWallet: { address: 'selected-address', isTon: false } }),
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key, tc: (key: string, count: number) => `${key}:${count}` }),
}));

import SettingsPage from '@/screens/settings/SettingsPage.vue';
import { POPUP_PATH, TOOLBAR_SURFACE_KEY } from '@/extension/toolbarSurface';

function chromeFixture({ sidePanel = true, tab = undefined as chrome.tabs.Tab | undefined } = {}) {
  const store: Record<string, unknown> = {};
  const api = {
    action: { setPopup: vi.fn().mockResolvedValue(undefined), openPopup: vi.fn().mockResolvedValue(undefined) },
    ...(sidePanel
      ? { sidePanel: { open: vi.fn().mockResolvedValue(undefined), setPanelBehavior: vi.fn().mockResolvedValue(undefined) } }
      : {}),
    storage: {
      local: {
        get: vi.fn(async () => ({ ...store })),
        set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, items)),
      },
    },
    runtime: { getContexts: vi.fn().mockResolvedValue([{ contextType: 'SIDE_PANEL' }]) },
    tabs: { getCurrent: vi.fn().mockResolvedValue(tab) },
    windows: { WINDOW_ID_CURRENT: -2, getCurrent: vi.fn().mockResolvedValue({ id: 9 }) },
  };
  mocks.chrome = api;
  return { api, store };
}

const mountSettings = () =>
  mount(SettingsPage, {
    global: {
      stubs: {
        ContentForm: { props: ['height'], template: '<main><slot /></main>' },
        Icon: { props: ['icon'], template: '<span :data-icon="icon" />' },
        Scroll: { template: '<div><slot /></div>' },
        VisualEffectsSetting: { template: '<div />' },
      },
    },
  });

describe('Settings: what the toolbar opens', () => {
  let close: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mocks.isSidePanel = false;
    close = vi.spyOn(window, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => close.mockRestore());

  it('is not offered without the side panel API, as in Firefox', async () => {
    chromeFixture({ sidePanel: false });
    const wrapper = mountSettings();
    await flushPromises();

    expect(wrapper.find('[data-testid="settings-toolbar-surface"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="settings-language"]').exists()).toBe(true);
  });

  it('opens the panel from the popup inside the click, then closes the popup', async () => {
    const { api, store } = chromeFixture();
    const wrapper = mountSettings();
    await flushPromises();
    const row = wrapper.get('[data-testid="settings-toolbar-surface"]');

    expect(row.text()).toContain('sidePanel.switchToSidePanel');
    expect(row.find('[data-icon="side-panel"]').exists()).toBe(true);
    await row.trigger('click');
    expect(api.sidePanel!.open).toHaveBeenCalledExactlyOnceWith({ windowId: 9 });
    await flushPromises();
    expect(store[TOOLBAR_SURFACE_KEY]).toBe('side-panel');
    expect(close).toHaveBeenCalledOnce();
  });

  it('leaves a full tab open after opening the panel beside it', async () => {
    const { store } = chromeFixture({ tab: { id: 4 } as chrome.tabs.Tab });
    const wrapper = mountSettings();
    await flushPromises();

    await wrapper.get('[data-testid="settings-toolbar-surface"]').trigger('click');
    await flushPromises();
    expect(store[TOOLBAR_SURFACE_KEY]).toBe('side-panel');
    expect(close).not.toHaveBeenCalled();
  });

  it('says so when this browser cannot open the panel, and keeps the popup', async () => {
    const { api, store } = chromeFixture();
    api.sidePanel!.open.mockRejectedValueOnce(new Error('No side panel'));
    const wrapper = mountSettings();
    await flushPromises();

    await wrapper.get('[data-testid="settings-toolbar-surface"]').trigger('click');
    await flushPromises();
    expect(wrapper.get('[data-testid="settings-toolbar-surface"]').text()).toContain('sidePanel.unavailable');
    expect(store).not.toHaveProperty(TOOLBAR_SURFACE_KEY);
    expect(close).not.toHaveBeenCalled();
  });

  it('switches the side panel to the popup, opens it, and closes the panel', async () => {
    mocks.isSidePanel = true;
    const { api, store } = chromeFixture();
    const wrapper = mountSettings();
    await flushPromises();
    const row = wrapper.get('[data-testid="settings-toolbar-surface"]');

    expect(row.text()).toContain('sidePanel.switchToPopup');
    expect(row.find('[data-icon="popup-window"]').exists()).toBe(true);
    await row.trigger('click');
    expect(api.action.setPopup).toHaveBeenCalledWith({ popup: POPUP_PATH });
    expect(api.action.openPopup).toHaveBeenCalledOnce();
    await flushPromises();
    expect(store[TOOLBAR_SURFACE_KEY]).toBe('popup');
    expect(close).toHaveBeenCalledOnce();
  });
});
