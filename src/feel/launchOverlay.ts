// The launch (brand kit v3, SPEC "Launch, feel and sound" part 1, adapted to an extension). The first wallet view of a
// browser session (the toolbar popup, the side panel or a full tab) plays the Yatagarasu's Ignite, holds on its open
// wings until the wallet underneath is ready, then dives into the solar disc while the wallet zooms in from behind it.
// Every later view of the session gets only a short landing. Request windows (site approvals) get neither.
//
// The overlay only covers and reveals: the wallet's start, lock, unlock and routing run underneath exactly as before,
// and a key press always reaches the page (a password field under the overlay takes the typing).
import timeline from '@/assets/brand/hero/launch-timeline.json';
import clipUrl from '@/assets/brand/hero/popup-launch-ignite.webm';
import { LAUNCH_REVEAL_EVENT } from '@/feel/motion';

/** storage.session key: set when a session's launch starts, so a reload mid-clip lands instead of replaying. */
export const LAUNCH_SESSION_KEY = 'fearless:launch-ignite';
/** `?fw-launch=force` plays the launch in a harness build, where it is otherwise off (see decideLaunch). */
export const LAUNCH_FORCE_PARAM = 'fw-launch';

/** The kit's popup framing: 561x600 at 1.5x. */
export const LAUNCH_CLIP = { width: 842, height: 900 } as const;
export const LAUNCH_FOCUS = timeline.focus.popup;
/** Seconds into the clip. */
export const LAUNCH_TIMES = {
  hold: timeline.holdSeconds,
  handOff: 2.55,
  overlayOut: 2.7,
  end: timeline.durationSeconds,
} as const;
/** Milliseconds. */
export const LAUNCH_DURATIONS = {
  appIn: 550,
  overlayOut: 450,
  skip: 300,
  drop: 250,
  landing: 250,
  still: 200,
  stall: 1000,
  holdCap: 8000,
} as const;
const DECELERATE = 'cubic-bezier(0.05, 0.7, 0.1, 1)';
const ACCELERATE = 'cubic-bezier(0.3, 0, 1, 1)';

export type LaunchMode = 'ignite' | 'landing' | 'still' | 'none';

export interface LaunchDecisionInput {
  /** prefers-reduced-motion. */
  reducedMotion: boolean;
  /** The wallet's Reduced paint (data-fw-effects="reduced"), which also keeps the welcome crow still. */
  reducedEffects: boolean;
  /** A harness build (VUE_APP_EXTENSION_SMOKE): its smokes click and capture the first screen at once. */
  harnessBuild: boolean;
  forced: boolean;
  /** A window the background opened for a site's request. */
  requestWindow: boolean;
  /** Whether this browser session already played the launch; undefined when the session cannot be read. */
  playedThisSession: boolean | undefined;
}

/** Which arrival this view gets. A session that cannot be read never replays the launch on every open. */
export function decideLaunch(input: LaunchDecisionInput): LaunchMode {
  if (input.harnessBuild && !input.forced) return 'none';
  if (input.requestWindow) return 'none';
  if (input.reducedMotion || input.reducedEffects) return 'still';
  if (input.playedThisSession !== false) return 'landing';
  return 'ignite';
}

export interface LaunchFraming {
  /** cover fills the view and crops the clip; contain keeps the whole clip at full height with feathered sides. */
  mode: 'cover' | 'contain';
  /** The video element's box in the view, in CSS pixels. */
  box: { left: number; top: number; width: number; height: number };
  /** object-position of the clip inside that box (cover), in CSS pixels. */
  objectPosition: { x: number; y: number };
  /** Where the dive ends, in view pixels: the zoom of the wallet and of the overlay is anchored here. */
  focus: { x: number; y: number };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/**
 * Aspect-fill, centred on the focus as far as the frame allows. A view much wider than the clip (a full tab) would
 * crop the crow's head and the solar disc, so there the clip keeps its full height, centred, with feathered sides.
 */
export function launchFraming(
  view: { width: number; height: number },
  clip: { width: number; height: number } = LAUNCH_CLIP,
  focus: { x: number; y: number } = LAUNCH_FOCUS
): LaunchFraming {
  const width = Math.max(1, view.width);
  const height = Math.max(1, view.height);
  if (width / height > (clip.width / clip.height) * 1.15) {
    const boxWidth = (clip.width * height) / clip.height;
    const left = (width - boxWidth) / 2;
    return {
      mode: 'contain',
      box: { left, top: 0, width: boxWidth, height },
      objectPosition: { x: 0, y: 0 },
      focus: { x: left + focus.x * boxWidth, y: focus.y * height },
    };
  }
  const scale = Math.max(width / clip.width, height / clip.height);
  const drawnWidth = clip.width * scale;
  const drawnHeight = clip.height * scale;
  const x = clamp(width / 2 - focus.x * drawnWidth, width - drawnWidth, 0);
  const y = clamp(height / 2 - focus.y * drawnHeight, height - drawnHeight, 0);
  return {
    mode: 'cover',
    box: { left: 0, top: 0, width, height },
    objectPosition: { x, y },
    focus: { x: x + focus.x * drawnWidth, y: y + focus.y * drawnHeight },
  };
}

type SessionArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
};
type ExtensionApi = {
  storage?: { session?: SessionArea };
  windows?: { getCurrent(): Promise<{ type?: string }> };
};

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

async function readSession(api: ExtensionApi): Promise<boolean | undefined> {
  const area = api.storage?.session;
  if (!area) return undefined;
  try {
    const stored = await area.get(LAUNCH_SESSION_KEY);
    return stored?.[LAUNCH_SESSION_KEY] !== undefined;
  } catch {
    return undefined;
  }
}

async function isRequestWindow(api: ExtensionApi): Promise<boolean> {
  try {
    return (await api.windows?.getCurrent())?.type === 'popup';
  } catch {
    return false;
  }
}

const motionReduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const effectsReduced = (): boolean => document.documentElement.dataset.fwEffects === 'reduced';
const appRoot = (): HTMLElement | null => document.getElementById('app');

export interface LaunchState {
  mode: LaunchMode;
  /** For checks and screenshots: what the overlay did last. */
  phase: 'deciding' | 'playing' | 'holding' | 'handing-off' | 'dropped' | 'done';
  reason?: string;
  /** The wallet underneath has started to show: the balance may count now (src/feel/countUp.ts). */
  revealed: boolean;
}

function reveal(state: LaunchState): void {
  if (state.revealed) return;
  state.revealed = true;
  globalThis.dispatchEvent?.(new Event(LAUNCH_REVEAL_EVENT));
}

export interface StartLaunchOptions {
  api: ExtensionApi;
  /** Resolves once the first screen is mounted, or the start failed and says so: startWallet()'s promise. */
  ready: Promise<unknown>;
  harnessBuild: boolean;
}

/**
 * Starts the launch for this page. It puts an ink cover over the start surface at once (the start surface is ink as
 * well, so nothing shows when the cover goes), decides in a few milliseconds, then plays, lands or steps aside.
 */
export function startLaunch({ api, ready, harnessBuild }: StartLaunchOptions): LaunchState {
  const state: LaunchState = { mode: 'none', phase: 'deciding', revealed: false };
  (window as Window & { __fwLaunch?: LaunchState }).__fwLaunch = state;
  const forced = new URLSearchParams(location.search).get(LAUNCH_FORCE_PARAM) === 'force';
  const reducedMotion = motionReduced();
  const reducedEffects = effectsReduced();
  let isReady = false;
  void ready.then(
    () => (isReady = true),
    () => (isReady = true)
  );

  // Without a chance of the full launch, nothing covers anything.
  if ((harnessBuild && !forced) || reducedMotion || reducedEffects) {
    state.mode = decideLaunch({ reducedMotion, reducedEffects, harnessBuild, forced, requestWindow: false, playedThisSession: true });
    state.phase = 'done';
    reveal(state);
    if (state.mode === 'still') void ready.then(() => revealApp('still'), () => undefined);
    return state;
  }

  const cover = document.createElement('div');
  cover.dataset.testid = 'launchOverlay';
  cover.setAttribute('aria-hidden', 'true');
  Object.assign(cover.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '10001',
    overflow: 'hidden',
    background: 'var(--fw-bg-base, #120a2e)',
    contain: 'strict',
  });
  document.body.appendChild(cover);

  void Promise.all([withTimeout(readSession(api), 400, undefined), withTimeout(isRequestWindow(api), 400, false)]).then(
    ([playedThisSession, requestWindow]) => {
      state.mode = decideLaunch({ reducedMotion, reducedEffects, harnessBuild, forced, requestWindow, playedThisSession });
      if (state.mode !== 'ignite') {
        cover.remove();
        state.phase = 'done';
        reveal(state);
        if (state.mode === 'landing') void ready.then(() => revealApp('landing'), () => undefined);
        return;
      }
      void api.storage?.session?.set({ [LAUNCH_SESSION_KEY]: Date.now() })?.catch?.(() => undefined);
      ignite(cover, state, () => isReady);
    }
  );
  return state;
}

/** The short arrival of every later view: the wallet scales from 1.04 to 1 and fades in (Reduced: a fade only). */
function revealApp(kind: 'landing' | 'still'): void {
  const app = appRoot();
  if (!app?.animate) return;
  const keyframes: Keyframe[] =
    kind === 'landing'
      ? [
          { transform: 'scale(1.04)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ]
      : [{ opacity: 0 }, { opacity: 1 }];
  app.animate(keyframes, {
    duration: kind === 'landing' ? LAUNCH_DURATIONS.landing : LAUNCH_DURATIONS.still,
    easing: DECELERATE,
  });
}

function ignite(cover: HTMLElement, state: LaunchState, ready: () => boolean): void {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.disablePictureInPicture = true;
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('tabindex', '-1');
  video.src = clipUrl;
  let framing = launchFraming({ width: innerWidth, height: innerHeight });
  const place = (): void => {
    framing = launchFraming({ width: innerWidth, height: innerHeight });
    const { box, mode, objectPosition } = framing;
    Object.assign(video.style, {
      position: 'absolute',
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      objectFit: 'cover',
      objectPosition: mode === 'cover' ? `${objectPosition.x}px ${objectPosition.y}px` : '50% 50%',
      // A full tab shows the whole clip at full height; its sides melt into the ink.
      maskImage: mode === 'contain' ? 'linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)' : '',
      webkitMaskImage: mode === 'contain' ? 'linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)' : '',
      pointerEvents: 'none',
    });
  };
  place();
  cover.appendChild(video);
  cover.style.cursor = 'pointer';
  addEventListener('resize', place);

  let raf = 0;
  let handedOff = false;
  let finished = false;
  let holdStartedAt = 0;
  let lastTime = -1;
  let lastProgressAt = performance.now();
  const startedAt = performance.now();

  const finish = (): void => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', place);
    removeEventListener('keydown', onKey, true);
    cover.removeEventListener('click', onClick);
    video.pause();
    video.removeAttribute('src');
    video.load();
    cover.remove();
    if (state.phase !== 'dropped') state.phase = 'done';
    reveal(state);
  };

  // The clip cannot load or has stopped moving: the overlay fades away and the wallet is simply there.
  const drop = (reason: string): void => {
    if (handedOff || finished) return;
    handedOff = true;
    state.phase = 'dropped';
    state.reason = reason;
    reveal(state);
    cover.style.pointerEvents = 'none';
    const fade = cover.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: LAUNCH_DURATIONS.drop, fill: 'forwards' });
    if (fade) fade.onfinish = finish;
    else finish();
  };

  const handOff = (fast: boolean): void => {
    if (handedOff || finished) return;
    handedOff = true;
    state.phase = 'handing-off';
    if (fast) state.reason = 'skipped';
    reveal(state);
    cover.style.pointerEvents = 'none';
    const { focus } = framing;
    const app = appRoot();
    if (app?.animate) {
      const rect = app.getBoundingClientRect();
      app.style.transformOrigin = `${focus.x - rect.left}px ${focus.y - rect.top}px`;
      const zoom = app.animate(
        [
          { transform: 'scale(1.18)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: fast ? LAUNCH_DURATIONS.skip : LAUNCH_DURATIONS.appIn, easing: DECELERATE }
      );
      zoom.onfinish = () => app.style.removeProperty('transform-origin');
    }
    cover.style.transformOrigin = `${focus.x}px ${focus.y}px`;
    const out = cover.animate?.(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.6)', opacity: 0 },
      ],
      {
        duration: fast ? LAUNCH_DURATIONS.skip : LAUNCH_DURATIONS.overlayOut,
        delay: fast ? 0 : (LAUNCH_TIMES.overlayOut - LAUNCH_TIMES.handOff) * 1000,
        easing: ACCELERATE,
        fill: 'forwards',
      }
    );
    if (out) out.onfinish = finish;
    else finish();
  };

  // A click skips straight to the zoom. It is the click, not the press, so the release cannot land on the wallet.
  const onClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    handOff(true);
  };
  // A key skips as well and still reaches the page: a password field under the overlay gets the typing.
  const onKey = (): void => handOff(true);
  cover.addEventListener('click', onClick);
  addEventListener('keydown', onKey, true);
  // A hidden side panel stops the frames; coming back is not a stall.
  document.addEventListener('visibilitychange', () => (lastProgressAt = performance.now()));

  const tick = (): void => {
    raf = 0;
    if (finished || handedOff) return;
    const now = performance.now();
    const time = video.currentTime;
    if (time !== lastTime) {
      lastTime = time;
      lastProgressAt = now;
    }
    const wait = ready();
    if (time >= LAUNCH_TIMES.hold && !wait) {
      // Hold on the open wings until the wallet underneath can be shown; a wallet that never says so is shown anyway.
      if (!holdStartedAt) holdStartedAt = now;
      if (now - holdStartedAt < LAUNCH_DURATIONS.holdCap) {
        if (!video.paused) video.pause();
        state.phase = 'holding';
        lastProgressAt = now;
        raf = requestAnimationFrame(tick);
        return;
      }
    }
    if (video.paused && !video.ended && state.phase === 'holding') {
      state.phase = 'playing';
      void video.play().catch(() => drop('resume refused'));
    }
    if (time >= LAUNCH_TIMES.handOff || video.ended) {
      handOff(false);
      return;
    }
    if (now - lastProgressAt > LAUNCH_DURATIONS.stall && !video.paused) {
      drop(time === 0 ? 'did not start' : 'stalled');
      return;
    }
    if (time === 0 && now - startedAt > LAUNCH_DURATIONS.stall) {
      drop('did not start');
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  video.addEventListener('error', () => drop('could not load'));
  video.addEventListener('ended', () => handOff(false));
  state.phase = 'playing';
  void video.play().then(
    () => {
      if (!raf && !handedOff) raf = requestAnimationFrame(tick);
    },
    () => drop('play refused')
  );
  raf = requestAnimationFrame(tick);
}
