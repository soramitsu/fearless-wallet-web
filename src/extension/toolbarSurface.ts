// What the toolbar button opens. Like current MetaMask, Fearless opens in Chrome's side panel, which is as tall as the
// browser, unless the person chose the popup or this browser could not show the panel. The manifest keeps popup.html as
// the action popup, so a browser without the side panel API, or a worker that has not applied the choice yet, still
// opens the wallet.
//
// Two stored values give one of three toolbar modes:
// - popup: the person chose it, or the panel did not load here. The action popup is set.
// - side-panel: the panel has loaded in this browser before. No popup; Chrome toggles the panel itself.
// - probe: the panel is wanted but has not loaded here yet (the first click after this update). No popup and no panel
//   behaviour, so the click reaches action.onClicked, which opens the panel and falls back to the popup unless the panel
//   page reports within SIDE_PANEL_LOAD_TIMEOUT_MS. Some Chromium browsers expose the API without showing a panel.

export const TOOLBAR_SURFACE_KEY = 'fearless:toolbar-surface';
export const SIDE_PANEL_STATUS_KEY = 'fearless:side-panel-status';
export const POPUP_PATH = 'popup.html#/';
export const SIDE_PANEL_LOAD_TIMEOUT_MS = 10_000;
// The size of the dApp request window (PopupHandler), for Chrome versions before 127 that cannot open the popup.
const POPUP_WINDOW = { width: 577, height: 640 };

export type ToolbarMode = 'popup' | 'side-panel' | 'probe';

type Stored = { surface: unknown; status: unknown };

export function sidePanelAvailable(api: typeof chrome | undefined): boolean {
  return typeof api?.sidePanel?.open === 'function' && typeof api.sidePanel.setPanelBehavior === 'function';
}

export function toolbarMode({ surface, status }: Stored): ToolbarMode {
  if (surface === 'popup' || status === 'unavailable') return 'popup';

  return status === 'working' ? 'side-panel' : 'probe';
}

async function readStored(api: typeof chrome): Promise<Stored> {
  const stored = await api.storage.local.get([TOOLBAR_SURFACE_KEY, SIDE_PANEL_STATUS_KEY]);

  return { surface: stored[TOOLBAR_SURFACE_KEY], status: stored[SIDE_PANEL_STATUS_KEY] };
}

let applying: Promise<void> = Promise.resolve();

/** Brings the toolbar button in line with storage. Calls run one at a time, and each reads storage afresh. */
export function applyToolbarSurface(api: typeof chrome): Promise<void> {
  if (!sidePanelAvailable(api)) return Promise.resolve();

  const sidePanel = api.sidePanel;
  const run = applying.then(async () => {
    const mode = toolbarMode(await readStored(api));

    // The popup is set before the panel behaviour goes off, and cleared only after it is on (or, in probe mode, off),
    // so a click between the two calls opens the popup rather than nothing.
    if (mode === 'popup') {
      await api.action.setPopup({ popup: POPUP_PATH });
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    } else {
      await sidePanel.setPanelBehavior({ openPanelOnActionClick: mode === 'side-panel' });
      await api.action.setPopup({ popup: '' });
    }
  });

  applying = run.catch(() => undefined);

  return run;
}

/** Opens the wallet in a popup now: the action popup from Chrome 127, otherwise a window of the same size. */
async function openPopupNow(api: typeof chrome, windowId?: number): Promise<void> {
  try {
    // Before Chrome 127 openPopup is missing, or refused outside policy installs; either lands in the catch.
    await (windowId === undefined ? api.action.openPopup() : api.action.openPopup({ windowId }));
  } catch {
    await api.windows.create({ url: api.runtime.getURL(POPUP_PATH), type: 'popup', focused: true, ...POPUP_WINDOW });
  }
}

/**
 * Whether a side panel page of this extension appears within the time a panel takes to load. Chrome lists side panel
 * pages with no window (windowId -1), so any counts. Where runtime.getContexts cannot list side panels (older Chrome),
 * the open() that resolved is all there is to go by.
 */
async function sidePanelPageAppears(api: typeof chrome, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  try {
    for (;;) {
      const pages = await api.runtime.getContexts({ contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType] });

      if (pages.length) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch {
    return true;
  }
}

async function fallBackToPopup(api: typeof chrome, windowId: number): Promise<void> {
  // A panel that has loaded here before keeps its mode; only this click is answered with the popup.
  if ((await readStored(api)).status !== 'working') {
    await api.storage.local.set({ [SIDE_PANEL_STATUS_KEY]: 'unavailable' });
  }
  await applyToolbarSurface(api);
  await openPopupNow(api, windowId);
}

let probing: Promise<void> | undefined;

/**
 * A toolbar click that Chrome answered with neither the popup nor the panel: probe mode, or a browser that ignores the
 * panel behaviour. Opens the panel, and falls back to the popup unless the panel page reports that it loaded.
 */
export function onToolbarClicked(
  api: typeof chrome,
  tab: chrome.tabs.Tab,
  timeoutMs = SIDE_PANEL_LOAD_TIMEOUT_MS
): Promise<void> {
  const { windowId } = tab;
  let opened: Promise<void>;

  try {
    // Synchronously, while the click still counts as a user gesture.
    opened = api.sidePanel.open({ windowId });
  } catch (error) {
    opened = Promise.reject(error);
  }

  // One check at a time: more clicks while it runs open the panel again, but fall back at most once.
  if (probing) {
    opened.catch(() => undefined);

    return probing;
  }

  const probe = opened
    .then(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
        if ((await readStored(api)).status !== 'working') await fallBackToPopup(api, windowId);
      },
      () => fallBackToPopup(api, windowId)
    )
    .finally(() => {
      probing = undefined;
    });

  probing = probe;

  return probe;
}

/** Registers the toolbar listeners with the other MV3 wake listeners, then applies the stored choice. */
export function registerToolbarSurface(api: typeof chrome, reportError: (error: unknown) => void): void {
  if (!sidePanelAvailable(api)) return;

  const apply = () => {
    applyToolbarSurface(api).catch(reportError);
  };

  api.action.onClicked.addListener((tab) => {
    onToolbarClicked(api, tab).catch(reportError);
  });
  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (TOOLBAR_SURFACE_KEY in changes || SIDE_PANEL_STATUS_KEY in changes)) apply();
  });
  api.runtime.onStartup.addListener(apply);
  apply();
}

/**
 * The side panel page loaded: from now on Chrome toggles the panel from the toolbar itself. An open panel is the proof,
 * so it records `working` again if a toolbar check that timed out as it loaded records `unavailable`.
 */
export async function markSidePanelWorking(api: typeof chrome): Promise<void> {
  const record = async () => {
    if ((await readStored(api)).status !== 'working') await api.storage.local.set({ [SIDE_PANEL_STATUS_KEY]: 'working' });
  };

  api.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && SIDE_PANEL_STATUS_KEY in changes && changes[SIDE_PANEL_STATUS_KEY].newValue !== 'working') {
      record().catch(() => undefined);
    }
  });
  await record();
}

/**
 * Settings, in the side panel: the toolbar opens the popup from now on. Call it from the click: the popup is set
 * synchronously so that openPopup, which may need the click's user gesture, finds it. Resolves once it is stored.
 */
export function switchToPopup(api: typeof chrome): Promise<void> {
  void api.action.setPopup({ popup: POPUP_PATH }).catch(() => undefined);
  const opening = openPopupNow(api).catch(() => undefined);

  return Promise.all([opening, api.storage.local.set({ [TOOLBAR_SURFACE_KEY]: 'popup' })]).then(() => undefined);
}

/**
 * Settings, outside the side panel: opens the panel in the given window and makes the toolbar open it from now on. Call
 * it from the click, synchronously, as sidePanel.open needs the user gesture. Pass a real window id: older Chrome does
 * not accept WINDOW_ID_CURRENT there. Resolves false, storing nothing, if no panel page appears.
 */
export function switchToSidePanel(
  api: typeof chrome,
  windowId: number,
  timeoutMs = SIDE_PANEL_LOAD_TIMEOUT_MS
): Promise<boolean> {
  let opened: Promise<void>;

  try {
    opened = api.sidePanel.open({ windowId });
  } catch (error) {
    opened = Promise.reject(error);
  }

  return opened.then(
    async () => {
      // Some Chromium browsers resolve without showing a panel.
      if (!(await sidePanelPageAppears(api, timeoutMs))) return false;
      await api.storage.local.set({ [TOOLBAR_SURFACE_KEY]: 'side-panel' });

      return true;
    },
    () => false
  );
}
