import { describe, expect, it, vi } from 'vitest';
import {
  POPUP_PATH,
  SIDE_PANEL_STATUS_KEY,
  TOOLBAR_SURFACE_KEY,
  applyToolbarSurface,
  markSidePanelWorking,
  onToolbarClicked,
  registerToolbarSurface,
  sidePanelAvailable,
  switchToPopup,
  switchToSidePanel,
  toolbarMode,
} from '@/extension/toolbarSurface';

function event() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return {
    addListener: vi.fn((listener: (...args: unknown[]) => void) => listeners.push(listener)),
    emit: (...args: unknown[]) => listeners.forEach((listener) => listener(...args)),
  };
}

// A Chrome with the side panel API: calls are recorded in order, storage is a plain object that reports its changes.
function fixture(stored: Record<string, unknown> = {}, { sidePanel = true } = {}) {
  const store = { ...stored };
  const calls: string[] = [];
  const onChanged = event();
  const api = {
    action: {
      setPopup: vi.fn(async ({ popup }: { popup: string }) => void calls.push(`popup:${popup}`)),
      openPopup: vi.fn(async () => void calls.push('openPopup')),
      onClicked: event(),
    },
    ...(sidePanel
      ? {
          sidePanel: {
            open: vi.fn(async ({ windowId }: { windowId: number }) => void calls.push(`open:${windowId}`)),
            setPanelBehavior: vi.fn(
              async ({ openPanelOnActionClick }: { openPanelOnActionClick: boolean }) =>
                void calls.push(`panelOnClick:${openPanelOnActionClick}`)
            ),
          },
        }
      : {}),
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]]))),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
          onChanged.emit(Object.fromEntries(Object.keys(items).map((key) => [key, { newValue: items[key] }])), 'local');
        }),
      },
      onChanged,
    },
    runtime: {
      getURL: (path: string) => `chrome-extension://fearless/${path}`,
      onStartup: event(),
      // The side panel pages Chrome lists for a window, as runtime.getContexts reports them.
      getContexts: vi.fn(async () => [{ contextType: 'SIDE_PANEL' }]),
    },
    windows: { WINDOW_ID_CURRENT: -2, create: vi.fn(async () => void calls.push('window')) },
  };
  return { api, chrome: api as unknown as typeof chrome, store, calls };
}

const tab = (windowId = 7) => ({ windowId }) as chrome.tabs.Tab;

describe('toolbar mode', () => {
  it('opens the popup when the person chose it or the panel did not load here', () => {
    expect(toolbarMode({ surface: 'popup', status: 'working' })).toBe('popup');
    expect(toolbarMode({ surface: undefined, status: 'unavailable' })).toBe('popup');
    expect(toolbarMode({ surface: 'side-panel', status: 'unavailable' })).toBe('popup');
  });

  it('lets Chrome toggle the panel once it has loaded, and probes before that', () => {
    expect(toolbarMode({ surface: undefined, status: 'working' })).toBe('side-panel');
    expect(toolbarMode({ surface: 'side-panel', status: 'working' })).toBe('side-panel');
    expect(toolbarMode({ surface: undefined, status: undefined })).toBe('probe');
    expect(toolbarMode({ surface: 'unexpected', status: 'unexpected' })).toBe('probe');
  });
});

describe('side panel support', () => {
  it('needs both the panel and its toolbar behaviour', () => {
    expect(sidePanelAvailable(fixture().chrome)).toBe(true);
    expect(sidePanelAvailable(fixture({}, { sidePanel: false }).chrome)).toBe(false);
    expect(sidePanelAvailable({ sidePanel: { open: vi.fn() } } as unknown as typeof chrome)).toBe(false);
    // The web build has no extension API at all.
    expect(sidePanelAvailable(undefined)).toBe(false);
  });
});

describe('applying the toolbar mode', () => {
  it('does nothing without the side panel API, so the manifest popup stays', async () => {
    const f = fixture({}, { sidePanel: false });

    await applyToolbarSurface(f.chrome);
    expect(f.calls).toEqual([]);
  });

  it('probes with neither popup nor panel behaviour, so the click reaches the worker', async () => {
    const f = fixture();

    await applyToolbarSurface(f.chrome);
    expect(f.calls).toEqual(['panelOnClick:false', 'popup:']);
  });

  it('turns the panel behaviour on before it clears the popup', async () => {
    const f = fixture({ [SIDE_PANEL_STATUS_KEY]: 'working' });

    await applyToolbarSurface(f.chrome);
    expect(f.calls).toEqual(['panelOnClick:true', 'popup:']);
  });

  it('sets the popup before it turns the panel behaviour off', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup', [SIDE_PANEL_STATUS_KEY]: 'working' });

    await applyToolbarSurface(f.chrome);
    expect(f.calls).toEqual([`popup:${POPUP_PATH}`, 'panelOnClick:false']);
  });

  it('runs one application at a time, each reading storage when its turn comes', async () => {
    const f = fixture();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    f.api.sidePanel!.setPanelBehavior.mockImplementationOnce(async ({ openPanelOnActionClick }) => {
      await held;
      f.calls.push(`panelOnClick:${openPanelOnActionClick}`);
    });
    const first = applyToolbarSurface(f.chrome);
    const second = applyToolbarSurface(f.chrome);

    await vi.waitFor(() => expect(f.api.sidePanel!.setPanelBehavior).toHaveBeenCalledOnce());
    expect(f.api.storage.local.get).toHaveBeenCalledOnce();
    f.store[SIDE_PANEL_STATUS_KEY] = 'working';
    release();
    await Promise.all([first, second]);
    expect(f.calls).toEqual(['panelOnClick:false', 'popup:', 'panelOnClick:true', 'popup:']);
  });

  it('keeps applying after a failed call', async () => {
    const f = fixture();
    f.api.sidePanel!.setPanelBehavior.mockRejectedValueOnce(new Error('window closing'));

    await expect(applyToolbarSurface(f.chrome)).rejects.toThrow('window closing');
    await applyToolbarSurface(f.chrome);
    expect(f.calls).toEqual(['panelOnClick:false', 'popup:']);
  });
});

describe('worker registration', () => {
  it('registers nothing without the side panel API', () => {
    const f = fixture({}, { sidePanel: false });

    registerToolbarSurface(f.chrome, vi.fn());
    expect(f.api.action.onClicked.addListener).not.toHaveBeenCalled();
    expect(f.api.storage.onChanged.addListener).not.toHaveBeenCalled();
  });

  it('applies the stored choice at once and again when it changes in local storage', async () => {
    const f = fixture();
    const reportError = vi.fn();

    registerToolbarSurface(f.chrome, reportError);
    expect(f.api.action.onClicked.addListener).toHaveBeenCalledOnce();
    expect(f.api.runtime.onStartup.addListener).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(f.calls).toEqual(['panelOnClick:false', 'popup:']));

    f.api.storage.onChanged.emit({ unrelated: { newValue: 1 } }, 'local');
    f.api.storage.onChanged.emit({ [TOOLBAR_SURFACE_KEY]: { newValue: 'popup' } }, 'sync');
    await Promise.resolve();
    expect(f.api.storage.local.get).toHaveBeenCalledTimes(1);

    await f.chrome.storage.local.set({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    await vi.waitFor(() => expect(f.calls.slice(2)).toEqual([`popup:${POPUP_PATH}`, 'panelOnClick:false']));

    f.api.runtime.onStartup.emit();
    await vi.waitFor(() => expect(f.calls).toHaveLength(6));
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('a toolbar click the worker answers', () => {
  it('opens the panel inside the click, before anything is awaited', async () => {
    const f = fixture();
    const click = onToolbarClicked(f.chrome, tab(7), 1);

    expect(f.api.sidePanel!.open).toHaveBeenCalledExactlyOnceWith({ windowId: 7 });
    // The check ends before the next test clicks.
    await click;
  });

  it('keeps the panel when its page reports that it loaded', async () => {
    const f = fixture();
    const click = onToolbarClicked(f.chrome, tab(), 20);

    await markSidePanelWorking(f.chrome);
    await click;
    expect(f.store[SIDE_PANEL_STATUS_KEY]).toBe('working');
    expect(f.api.action.openPopup).not.toHaveBeenCalled();
  });

  it('falls back to the popup, now and for later clicks, when the panel never loads', async () => {
    const f = fixture();

    await onToolbarClicked(f.chrome, tab(9), 1);
    expect(f.store[SIDE_PANEL_STATUS_KEY]).toBe('unavailable');
    expect(f.calls.slice(-3)).toEqual([`popup:${POPUP_PATH}`, 'panelOnClick:false', 'openPopup']);
    expect(f.api.action.openPopup).toHaveBeenCalledWith({ windowId: 9 });
  });

  it('answers only this click with the popup when Chrome refuses to open the panel', async () => {
    const f = fixture();
    f.api.sidePanel!.open.mockRejectedValueOnce(new Error('No side panel for this window'));

    await onToolbarClicked(f.chrome, tab(), 60_000);
    expect(f.calls.at(-1)).toBe('openPopup');
    // The refusal may be about this one window, so nothing is stored and the next click tries the panel again.
    expect(f.store[SIDE_PANEL_STATUS_KEY]).toBeUndefined();
    await onToolbarClicked(f.chrome, tab(), 1);
    expect(f.api.sidePanel!.open).toHaveBeenCalledTimes(2);
  });

  it('answers only this click when the call throws instead of rejecting', async () => {
    const f = fixture();
    f.api.sidePanel!.open.mockImplementationOnce(() => {
      throw new Error('Not supported');
    });

    await onToolbarClicked(f.chrome, tab(), 60_000);
    expect(f.store[SIDE_PANEL_STATUS_KEY]).toBeUndefined();
    expect(f.calls.at(-1)).toBe('openPopup');
  });

  it('opens a window of the popup size before Chrome 127, where openPopup is refused', async () => {
    const f = fixture();
    f.api.sidePanel!.open.mockRejectedValueOnce(new Error('No side panel'));
    f.api.action.openPopup.mockRejectedValueOnce(new Error('Not allowed'));

    await onToolbarClicked(f.chrome, tab(), 60_000);
    expect(f.api.windows.create).toHaveBeenCalledWith({
      url: `chrome-extension://fearless/${POPUP_PATH}`,
      type: 'popup',
      focused: true,
      width: 577,
      height: 640,
    });
  });

  it('falls back once however often the button is clicked while it waits', async () => {
    const f = fixture();
    const first = onToolbarClicked(f.chrome, tab(), 20);
    const second = onToolbarClicked(f.chrome, tab(), 20);

    expect(f.api.sidePanel!.open).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(f.api.action.openPopup).toHaveBeenCalledOnce();
    expect(f.api.windows.create).not.toHaveBeenCalled();
  });

  it('checks again on a later click once a check has ended', async () => {
    const f = fixture();

    await onToolbarClicked(f.chrome, tab(), 1);
    await onToolbarClicked(f.chrome, tab(), 1);
    expect(f.api.action.openPopup).toHaveBeenCalledTimes(2);
  });

  it('answers only this click with the popup when the panel has loaded here before', async () => {
    const f = fixture({ [SIDE_PANEL_STATUS_KEY]: 'working' });
    f.api.sidePanel!.open.mockRejectedValueOnce(new Error('Window closing'));

    await onToolbarClicked(f.chrome, tab(), 60_000);
    expect(f.store[SIDE_PANEL_STATUS_KEY]).toBe('working');
    // The toolbar keeps its panel mode untouched; only this click opens the popup.
    expect(f.calls).toEqual(['openPopup']);
    expect(f.api.action.openPopup).toHaveBeenCalledOnce();
  });
});

describe('the pages', () => {
  it('records once that the panel loaded', async () => {
    const f = fixture();

    await markSidePanelWorking(f.chrome);
    await markSidePanelWorking(f.chrome);
    expect(f.api.storage.local.set).toHaveBeenCalledExactlyOnceWith({ [SIDE_PANEL_STATUS_KEY]: 'working' });
  });

  it('wins over a toolbar check that timed out while the panel was loading', async () => {
    const f = fixture();

    await markSidePanelWorking(f.chrome);
    await f.chrome.storage.local.set({ [SIDE_PANEL_STATUS_KEY]: 'unavailable' });
    await vi.waitFor(() => expect(f.store[SIDE_PANEL_STATUS_KEY]).toBe('working'));
  });

  it('sets the popup inside the click, before it opens it, then stores the choice', async () => {
    const f = fixture();
    const switched = switchToPopup(f.chrome);

    expect(f.api.action.setPopup).toHaveBeenCalledWith({ popup: POPUP_PATH });
    expect(f.api.action.openPopup).toHaveBeenCalledOnce();
    expect(f.api.action.setPopup.mock.invocationCallOrder[0]).toBeLessThan(f.api.action.openPopup.mock.invocationCallOrder[0]);
    await switched;
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('popup');
  });

  it('stores the popup choice and opens a popup window where openPopup is refused', async () => {
    const f = fixture();
    f.api.action.openPopup.mockRejectedValueOnce(new Error('Not allowed'));

    await switchToPopup(f.chrome);
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('popup');
    expect(f.api.windows.create).toHaveBeenCalledOnce();
  });

  it('switches to the popup without throwing where Chrome has no openPopup at all', async () => {
    const f = fixture();
    (f.api.action as { openPopup?: unknown }).openPopup = undefined;

    await expect(switchToPopup(f.chrome)).resolves.toBeUndefined();
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('popup');
    expect(f.api.windows.create).toHaveBeenCalledOnce();
  });

  it('opens the panel in the window inside the click and stores the choice once its page is there', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    const switched = switchToSidePanel(f.chrome, 3, 50);

    expect(f.api.sidePanel!.open).toHaveBeenCalledExactlyOnceWith({ windowId: 3 });
    expect(await switched).toBe(true);
    expect(f.api.runtime.getContexts).toHaveBeenCalledWith({ contextTypes: ['SIDE_PANEL'] });
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('side-panel');
  });

  it('keeps the popup when the panel cannot open', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    f.api.sidePanel!.open.mockRejectedValueOnce(new Error('No side panel'));

    expect(await switchToSidePanel(f.chrome, 3, 50)).toBe(false);
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('popup');
  });

  it('keeps the popup when open() resolves but no panel page ever appears', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    f.api.runtime.getContexts.mockResolvedValue([]);

    expect(await switchToSidePanel(f.chrome, 3, 50)).toBe(false);
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('popup');
  });

  it('waits for a panel page that is slow to appear', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    f.api.runtime.getContexts.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    expect(await switchToSidePanel(f.chrome, 3, 2000)).toBe(true);
    expect(f.api.runtime.getContexts).toHaveBeenCalledTimes(3);
  });

  it('goes by open() where Chrome cannot list side panel pages', async () => {
    const f = fixture({ [TOOLBAR_SURFACE_KEY]: 'popup' });
    f.api.runtime.getContexts.mockRejectedValue(new Error("Invalid enumeration value 'SIDE_PANEL'"));

    expect(await switchToSidePanel(f.chrome, 3, 50)).toBe(true);
    expect(f.store[TOOLBAR_SURFACE_KEY]).toBe('side-panel');
  });
});
