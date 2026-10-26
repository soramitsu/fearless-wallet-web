import { followActiveTab } from '@/extension/activeTab';
import { actions } from '@/stores/extension/actions';

const messaging = vi.hoisted(() => ({ isTabAuthorize: vi.fn() }));

vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/router/routes', () => ({ Components: {} }));
vi.mock('@/extension/messaging', () => messaging);

function event() {
  const listeners = new Set<(...args: never[]) => void>();
  return {
    addListener: vi.fn((listener: (...args: never[]) => void) => listeners.add(listener)),
    removeListener: vi.fn((listener: (...args: never[]) => void) => listeners.delete(listener)),
    emit: (...args: unknown[]) => listeners.forEach((listener) => (listener as (...values: unknown[]) => void)(...args)),
    get size() {
      return listeners.size;
    },
  };
}

function tabsFixture() {
  const api = {
    tabs: { onActivated: event(), onUpdated: event() },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: event() },
  };
  return { api, chrome: api as unknown as typeof chrome };
}

describe('the side panel follows the active tab', () => {
  it('asks again when another tab is active, the active tab navigates, or a window takes focus', () => {
    const f = tabsFixture();
    const onChange = vi.fn();

    followActiveTab(onChange, f.chrome);
    f.api.tabs.onActivated.emit({ tabId: 2, windowId: 1 });
    f.api.tabs.onUpdated.emit(2, { url: 'https://dapp.example/' }, { active: true });
    f.api.windows.onFocusChanged.emit(1);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('ignores loading progress, background tabs and focus leaving the browser', () => {
    const f = tabsFixture();
    const onChange = vi.fn();

    followActiveTab(onChange, f.chrome);
    f.api.tabs.onUpdated.emit(2, { status: 'loading' }, { active: true });
    f.api.tabs.onUpdated.emit(3, { url: 'https://other.example/' }, { active: false });
    f.api.windows.onFocusChanged.emit(-1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops listening when the header goes', () => {
    const f = tabsFixture();
    const stop = followActiveTab(vi.fn(), f.chrome);

    stop();
    expect([f.api.tabs.onActivated.size, f.api.tabs.onUpdated.size, f.api.windows.onFocusChanged.size]).toEqual([0, 0, 0]);
  });
});

describe('the connection status of the current site', () => {
  it('keeps the newest answer when answers arrive out of order', async () => {
    const answers: ((status: unknown) => void)[] = [];
    messaging.isTabAuthorize.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));
    const setTabStatus = vi.fn();
    const fetchTabStatus = () => (actions.fetchTabStatus as (this: unknown) => Promise<void>).call({ setTabStatus });

    const older = fetchTabStatus();
    const newer = fetchTabStatus();
    answers[1]({ dAppName: 'new.example', isAuthorize: true, authorizeAccountsCount: 1 });
    await newer;
    answers[0]({ dAppName: 'old.example', isAuthorize: false, authorizeAccountsCount: 0 });
    await older;
    expect(setTabStatus).toHaveBeenCalledExactlyOnceWith({ dAppName: 'new.example', isAuthorize: true, authorizeAccountsCount: 1 });
  });
});

describe('which page this is', () => {
  afterEach(() => {
    delete document.documentElement.dataset.fwSurface;
    vi.resetModules();
  });

  it('knows the side panel page by the mark sidepanel.html carries, and gives it the popup layout at any width', async () => {
    document.documentElement.dataset.fwSurface = 'side-panel';
    expect(window.innerWidth).toBeGreaterThan(561);
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_SIDE_PANEL, IS_POPUP]).toEqual([true, true]);
  });

  it('treats a page wider than the popup without the mark as a full tab', async () => {
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_SIDE_PANEL, IS_POPUP]).toEqual([false, false]);
  });
});
