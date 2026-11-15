import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEPTH_ATTRIBUTE,
  LAUNCH_CLIP,
  LAUNCH_FOCUS,
  LAUNCH_SESSION_KEY,
  LAUNCH_SKIP_RATE,
  LAUNCH_SUBJECT_WIDTH,
  LAUNCH_TIMES,
  collectTiers,
  decideLaunch,
  launchFraming,
  startLaunch,
  type LaunchDecisionInput,
} from '@/feel/launchOverlay';
import { FLIGHT, MAX_TIER } from '@/feel/shikiban';

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

  it('keeps the open wings and the rings across a tall side panel, from the top', () => {
    const framing = launchFraming({ width: 360, height: 709 });
    const width = 360 / LAUNCH_SUBJECT_WIDTH;

    expect(framing.mode).toBe('band');
    expect(framing.box.width).toBeCloseTo(width, 5);
    expect(framing.box.height).toBeCloseTo((width * LAUNCH_CLIP.height) / LAUNCH_CLIP.width, 5);
    expect(framing.box.top).toBe(0);
    expect(framing.box.left).toBeCloseTo((360 - width) / 2, 5);
    expect(framing.focus.x).toBeCloseTo(180, 5);
    expect(framing.focus.y).toBeCloseTo(framing.box.height * LAUNCH_FOCUS.y, 5);
  });

  it('still fills a popup that is a little narrower than the clip', () => {
    expect(launchFraming({ width: 500, height: 600 }).mode).toBe('cover');
  });

  it('keeps the whole clip at full height in a wide tab, centred with feathered sides', () => {
    const framing = launchFraming({ width: 1280, height: 800 });

    expect(framing.mode).toBe('contain');
    expect(framing.box.height).toBe(800);
    expect(framing.box.left + framing.box.width / 2).toBeCloseTo(640, 5);
    expect(framing.focus.x).toBeCloseTo(640, 5);
  });
});

// Kit v4 "Shikiban" part 1: the flight starts where the clip's dive does, and a click or a key runs the rest of it
// 2.5 times faster. The parts of the first screen fly at the depths they declare.
describe('the flight into the wallet', () => {
  const box = (element: Element, width: number, height: number) =>
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width, height, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('starts at the clip\'s dive, which is also where an unready wallet holds it', () => {
    expect(LAUNCH_TIMES.flight).toBe(2);
    expect(LAUNCH_TIMES.hold).toBe(LAUNCH_TIMES.flight);
    expect(LAUNCH_SKIP_RATE).toBeCloseTo(FLIGHT.durationMs / FLIGHT.skipMs, 6);
    expect(LAUNCH_SKIP_RATE).toBeGreaterThan(2);
  });

  it('flies a screen that declares nothing as one piece', () => {
    document.body.innerHTML = '<div id="app"><main><p>wallet</p></main></div>';
    const app = document.getElementById('app') as HTMLElement;

    expect(collectTiers()).toEqual([{ element: app, depth: 0 }]);
    expect(collectTiers(null)).toEqual([]);
  });

  it('flies each declared part at its own depth, an inner declaration with its parent, and skips parts not on screen', () => {
    document.body.innerHTML = `<div id="app">
      <header ${DEPTH_ATTRIBUTE}="2" id="header"></header>
      <section ${DEPTH_ATTRIBUTE}="0" id="card"><i ${DEPTH_ATTRIBUTE}="4" id="inner"></i></section>
      <nav ${DEPTH_ATTRIBUTE}="1" id="actions"></nav>
      <ul ${DEPTH_ATTRIBUTE}="9" id="list"></ul>
      <aside ${DEPTH_ATTRIBUTE}="x" id="odd"></aside>
      <footer ${DEPTH_ATTRIBUTE}="2" id="gone"></footer>
    </div>`;
    for (const id of ['header', 'card', 'inner', 'actions', 'list', 'odd']) box(document.getElementById(id) as HTMLElement, 100, 40);
    box(document.getElementById('gone') as HTMLElement, 0, 0);

    expect(collectTiers().map(({ element, depth }) => [element.id, depth])).toEqual([
      ['header', 2],
      ['card', 0],
      ['actions', 1],
      // Deeper than the kit samples: with the deepest tier. Not a number: nearest.
      ['list', MAX_TIER],
      ['odd', 0],
    ]);
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
