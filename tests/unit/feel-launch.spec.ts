import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LAUNCH_CLIP,
  LAUNCH_FOCUS,
  LAUNCH_SESSION_KEY,
  decideLaunch,
  launchFraming,
  startLaunch,
  type LaunchDecisionInput,
} from '@/feel/launchOverlay';

// Brand kit v3 SPEC part 1, adapted to the extension: once per browser session, on the first wallet view.
const base: LaunchDecisionInput = {
  reducedMotion: false,
  reducedEffects: false,
  harnessBuild: false,
  forced: false,
  requestWindow: false,
  playedThisSession: false,
};

describe('which arrival a wallet view gets', () => {
  it('plays the Ignite on the first wallet view of a browser session', () => {
    expect(decideLaunch(base)).toBe('ignite');
  });

  it('gives every later view of the session the short landing, and never replays when the session cannot be read', () => {
    expect(decideLaunch({ ...base, playedThisSession: true })).toBe('landing');
    expect(decideLaunch({ ...base, playedThisSession: undefined })).toBe('landing');
  });

  it('never plays over a site request window', () => {
    expect(decideLaunch({ ...base, requestWindow: true })).toBe('none');
  });

  it('fades only, under reduced motion or the Reduced paint', () => {
    expect(decideLaunch({ ...base, reducedMotion: true })).toBe('still');
    expect(decideLaunch({ ...base, reducedEffects: true })).toBe('still');
  });

  it('stays off in harness builds unless a page asks for it', () => {
    expect(decideLaunch({ ...base, harnessBuild: true })).toBe('none');
    expect(decideLaunch({ ...base, harnessBuild: true, forced: true })).toBe('ignite');
  });
});

describe('how the clip fills the view', () => {
  it('fills the 561 x 600 popup exactly, and dives at the kit focus', () => {
    const framing = launchFraming({ width: 561, height: 600 });

    expect(framing.mode).toBe('cover');
    expect(framing.objectPosition.x).toBeCloseTo(0, 0);
    expect(framing.objectPosition.y).toBeCloseTo(0, 0);
    expect(framing.focus.x).toBeCloseTo(561 * LAUNCH_FOCUS.x, 0);
    expect(framing.focus.y).toBeCloseTo(600 * LAUNCH_FOCUS.y, 0);
  });

  it('fills a tall side panel and keeps the crow centred', () => {
    const framing = launchFraming({ width: 360, height: 709 });
    const drawnWidth = (LAUNCH_CLIP.width * 709) / LAUNCH_CLIP.height;

    expect(framing.mode).toBe('cover');
    expect(framing.objectPosition.x).toBeCloseTo((360 - drawnWidth) / 2, 1);
    expect(framing.focus.x).toBeCloseTo(180, 1);
  });

  it('keeps the whole clip at full height in a wide tab, centred with feathered sides', () => {
    const framing = launchFraming({ width: 1280, height: 800 });

    expect(framing.mode).toBe('contain');
    expect(framing.box.height).toBe(800);
    expect(framing.box.left + framing.box.width / 2).toBeCloseTo(640, 5);
    expect(framing.focus.x).toBeCloseTo(640, 5);
  });
});

describe('starting the launch', () => {
  const session: Record<string, unknown> = {};
  const api = (windowType = 'normal', withSession = true) => ({
    storage: withSession
      ? {
          session: {
            get: vi.fn(async (key: string) => (key in session ? { [key]: session[key] } : {})),
            set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(session, items)),
          },
        }
      : {},
    windows: { getCurrent: vi.fn(async () => ({ type: windowType })) },
  });
  const overlay = () => document.querySelector('[data-testid="launchOverlay"]');

  beforeEach(() => {
    for (const key of Object.keys(session)) delete session[key];
    document.body.innerHTML = '<div id="app"></div>';
    delete document.documentElement.dataset.fwEffects;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('covers nothing in a harness build, and lets the balance count at once', () => {
    const state = startLaunch({ api: api(), ready: Promise.resolve(), harnessBuild: true });

    expect(state.mode).toBe('none');
    expect(state.revealed).toBe(true);
    expect(overlay()).toBeNull();
  });

  it('covers nothing under the Reduced paint, and only fades the wallet in', () => {
    document.documentElement.dataset.fwEffects = 'reduced';
    const state = startLaunch({ api: api(), ready: Promise.resolve(), harnessBuild: false });

    expect(state.mode).toBe('still');
    expect(overlay()).toBeNull();
  });

  it('plays the first time in a session and records it at once, so a reload lands instead', async () => {
    const first = startLaunch({ api: api(), ready: new Promise(() => undefined), harnessBuild: false });
    expect(overlay()).not.toBeNull();
    await vi.waitFor(() => expect(first.mode).toBe('ignite'));
    // The wallet is still covered: the balance waits to count until the dive shows it.
    expect(first.revealed).toBe(false);
    expect(session[LAUNCH_SESSION_KEY]).toEqual(expect.any(Number));
    expect(overlay()?.querySelector('video')?.muted).toBe(true);
    expect(overlay()?.getAttribute('aria-hidden')).toBe('true');

    document.body.innerHTML = '<div id="app"></div>';
    const second = startLaunch({ api: api(), ready: Promise.resolve(), harnessBuild: false });
    await vi.waitFor(() => expect(second.mode).toBe('landing'));
    expect(overlay()).toBeNull();
  });

  it('steps aside for a site request window and for a browser that cannot keep the session', async () => {
    const request = startLaunch({ api: api('popup'), ready: Promise.resolve(), harnessBuild: false });
    expect(request.phase).toBe('deciding');
    await vi.waitFor(() => expect(request.phase).toBe('done'));
    expect(request.mode).toBe('none');
    expect(overlay()).toBeNull();
    expect(session[LAUNCH_SESSION_KEY]).toBeUndefined();

    const noSession = startLaunch({ api: api('normal', false), ready: Promise.resolve(), harnessBuild: false });
    await vi.waitFor(() => expect(noSession.mode).toBe('landing'));
    expect(overlay()).toBeNull();
  });
});
