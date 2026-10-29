const surface = vi.hoisted(() => ({
  isExtension: true,
  chrome: {} as { extension?: { getViews?: ReturnType<typeof vi.fn> } },
}));

vi.mock('@extension-base/utils/crossenv', () => ({ chrome: surface.chrome }));
vi.mock('@/consts/global', () => ({ APP_WIDTH: 561, get IS_EXTENSION() { return surface.isExtension; } }));

describe('extension surface identity before Chrome sizes its popup', () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    vi.resetModules();
    surface.isExtension = true;
    surface.chrome.extension = { getViews: vi.fn(() => []) };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
  });

  afterEach(() => {
    delete document.documentElement.dataset.fwSurface;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    vi.resetModules();
  });

  it('keeps popup controls when the real toolbar popup starts wider than its final width', async () => {
    surface.chrome.extension!.getViews!.mockReturnValue([window]);
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_POPUP, IS_SIDE_PANEL]).toEqual([true, false]);
    expect(surface.chrome.extension!.getViews).toHaveBeenCalledWith({ type: 'popup' });
  });

  it('does not mistake a full tab for another open popup', async () => {
    surface.chrome.extension!.getViews!.mockReturnValue([{}]);
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_POPUP, IS_SIDE_PANEL]).toEqual([false, false]);
  });

  it('retains the narrow layout for existing standalone approval windows', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 561 });
    const { IS_POPUP } = await import('@/consts/globalClient');

    expect(IS_POPUP).toBe(true);
  });

  it('uses the side panel marker at any panel width without asking for popup views', async () => {
    document.documentElement.dataset.fwSurface = 'side-panel';
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_POPUP, IS_SIDE_PANEL]).toEqual([true, true]);
    expect(surface.chrome.extension!.getViews).not.toHaveBeenCalled();
  });

  it.each(['missing', 'throws'])('keeps the width fallback when the view API %s', async (failure) => {
    if (failure === 'missing') delete surface.chrome.extension;
    else surface.chrome.extension!.getViews!.mockImplementation(() => { throw new Error('Unavailable'); });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    const { IS_POPUP } = await import('@/consts/globalClient');

    expect(IS_POPUP).toBe(true);
  });

  it('never applies extension surface behavior to the web app', async () => {
    surface.isExtension = false;
    document.documentElement.dataset.fwSurface = 'side-panel';
    surface.chrome.extension!.getViews!.mockReturnValue([window]);
    const { IS_POPUP, IS_SIDE_PANEL } = await import('@/consts/globalClient');

    expect([IS_POPUP, IS_SIDE_PANEL]).toEqual([false, false]);
    expect(surface.chrome.extension!.getViews).not.toHaveBeenCalled();
  });
});
