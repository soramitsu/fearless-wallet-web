// The launch (brand kit v3, SPEC "Launch, feel and sound" part 1, and kit v4, "Shikiban" part 1, adapted to an
// extension). The first wallet view of a browser session (the toolbar popup, the side panel or a full tab) plays the
// Yatagarasu's Ignite and holds on its open wings until the wallet underneath is ready. Then the flight: the clip's
// dive runs on into a tunnel of gates, the mirror opens on the wallet at the end of it, and the wallet flies up and
// settles, its parts at their own depths. Every later view of the session gets only a short arrival from a little
// depth. Request windows (site approvals) get neither.
//
// The overlay only covers and reveals: the wallet's start, lock, unlock and routing run underneath exactly as before,
// and a key press always reaches the page (a password field under the overlay takes the typing).
import timeline from '@/assets/brand/hero/launch-timeline.json';
import clipUrl from '@/assets/brand/hero/popup-launch-ignite.webm';
import { LAUNCH_REVEAL_EVENT } from '@/feel/motion';
import { FLIGHT, MAX_TIER, cssEasing, irisRadius, landingFrom } from '@/feel/shikiban';
import { drawFlight } from '@/feel/shikibanDraw';

/** storage.session key: set when a session's launch starts, so a reload mid-clip lands instead of replaying. */
export const LAUNCH_SESSION_KEY = 'fearless:launch-ignite';
/** `?fw-launch=force` plays the launch in a harness build, where it is otherwise off (see decideLaunch). */
export const LAUNCH_FORCE_PARAM = 'fw-launch';

/** The kit's popup framing: 561x600 at 1.5x. */
export const LAUNCH_CLIP = { width: 842, height: 900 } as const;
export const LAUNCH_FOCUS = timeline.focus.popup;
/** Seconds into the clip: where an unready wallet holds it, and where the flight starts. */
export const LAUNCH_TIMES = {
  hold: timeline.holdSeconds,
  flight: timeline.zoomStartSeconds,
  end: timeline.durationSeconds,
} as const;
/** Milliseconds. The flight's own times are the kit's (FLIGHT in src/feel/shikiban.ts). */
export const LAUNCH_DURATIONS = {
  drop: 250,
  still: 200,
  stall: 1000,
  holdCap: 8000,
} as const;
/** How much faster the rest of the flight plays after a click or a key. */
export const LAUNCH_SKIP_RATE = FLIGHT.durationMs / FLIGHT.skipMs;
/**
 * A part of the first screen says how deep it lies with this attribute: 0 is nearest (the balance), then the actions,
 * the header and the tab bar, the tabs, the list. A screen that marks nothing arrives as one piece.
 */
export const DEPTH_ATTRIBUTE = 'data-fw-depth';
// Where the clip does not fill the view, its edges melt into the ink behind it.
const FEATHER: Record<LaunchFraming['mode'], string> = {
  cover: '',
  contain: 'linear-gradient(90deg, transparent, #000 14%, #000 86%, transparent)',
  band: 'linear-gradient(180deg, #000 0%, #000 78%, transparent 100%)',
};

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
  /**
   * cover fills the view and crops the clip; contain keeps the whole clip at full height with feathered sides (a wide
   * tab); band keeps the crow's open wings and the solar rings across a tall, narrow view (the side panel), anchored
   * at the top with its lower edge melting into the ink.
   */
  mode: 'cover' | 'contain' | 'band';
  /** The video element's box in the view, in CSS pixels. */
  box: { left: number; top: number; width: number; height: number };
  /** object-position of the clip inside that box (cover), in CSS pixels. */
  objectPosition: { x: number; y: number };
  /** Where the dive ends, in view pixels: the zoom of the wallet and of the overlay is anchored here. */
  focus: { x: number; y: number };
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** The share of the clip's width that holds the crow's open wings and the solar rings, centred. */
export const LAUNCH_SUBJECT_WIDTH = 0.8;

/**
 * Aspect-fill, centred on the focus as far as the frame allows. A view much wider than the clip (a full tab) would
 * crop the crow's head and the solar disc, so there the clip keeps its full height, centred, with feathered sides. A
 * view so narrow that filling it would cut off the wings and the rings (the side panel) shows the clip's middle
 * LAUNCH_SUBJECT_WIDTH across its width instead, from the top.
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
  if (width / (clip.width * scale) < LAUNCH_SUBJECT_WIDTH) {
    const boxWidth = width / LAUNCH_SUBJECT_WIDTH;
    const boxHeight = (boxWidth * clip.height) / clip.width;
    const left = (width - boxWidth) / 2;
    return {
      mode: 'band',
      box: { left, top: 0, width: boxWidth, height: boxHeight },
      objectPosition: { x: 0, y: 0 },
      focus: { x: left + focus.x * boxWidth, y: focus.y * boxHeight },
    };
  }
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
  phase: 'deciding' | 'playing' | 'holding' | 'flying' | 'dropped' | 'done';
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
    if (state.mode === 'still') void ready.then(() => revealStill(), () => undefined);
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
        if (state.mode === 'landing') void ready.then(() => land(), () => undefined);
        return;
      }
      void api.storage?.session?.set({ [LAUNCH_SESSION_KEY]: Date.now() })?.catch?.(() => undefined);
      ignite(cover, state, () => isReady);
    }
  );
  return state;
}

export interface Tier {
  element: HTMLElement;
  /** 0 is nearest; the kit samples MAX_TIER + 1 of them. */
  depth: number;
}

/**
 * The parts of the screen that fly at their own depth. Marked parts inside marked parts move with their parent, and a
 * part with no box is not on screen. With nothing marked the whole wallet is one tier.
 */
export function collectTiers(root: HTMLElement | null = appRoot()): Tier[] {
  if (!root) return [];
  const marked = Array.from(root.querySelectorAll<HTMLElement>(`[${DEPTH_ATTRIBUTE}]`)).filter((element) => {
    if (element.parentElement?.closest(`[${DEPTH_ATTRIBUTE}]`)) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  });
  if (!marked.length) return [{ element: root, depth: 0 }];

  return marked.map((element) => {
    const depth = Number(element.getAttribute(DEPTH_ATTRIBUTE));
    return { element, depth: Number.isFinite(depth) ? Math.min(MAX_TIER, Math.max(0, Math.round(depth))) : 0 };
  });
}

/**
 * Depth is a scale about the focus (SPEC v4 rule 2): the tier's own origin is the focus, in its own box. The flight
 * animates the `scale` property, never `transform`, so a part that places itself with a transform keeps its place.
 */
function aimAt(tier: Tier, focus: { x: number; y: number }): void {
  const box = tier.element.getBoundingClientRect();
  tier.element.style.transformOrigin = `${focus.x - box.left}px ${focus.y - box.top}px`;
}

/** Later views arrive from a little depth: every tier comes up to its place about the focus, the nearest first. */
function land(): void {
  const tiers = collectTiers();
  if (!tiers.length || !tiers[0].element.animate) return;
  const { focus } = launchFraming({ width: innerWidth, height: innerHeight });
  for (const tier of tiers) {
    aimAt(tier, focus);
    const delay = tier.depth * FLIGHT.tierStaggerMs;
    const arrive = tier.element.animate([{ scale: landingFrom(tier.depth).toFixed(4) }, { scale: '1' }], {
      duration: FLIGHT.landingMs,
      delay,
      easing: cssEasing('settle'),
      fill: 'backwards',
    });
    tier.element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FLIGHT.landingMs * 0.45, delay, fill: 'backwards' });
    arrive.onfinish = () => tier.element.style.removeProperty('transform-origin');
  }
}

/** Reduced motion: the wallet only fades in. */
function revealStill(): void {
  appRoot()?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: LAUNCH_DURATIONS.still, easing: cssEasing('settle') });
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
      maskImage: FEATHER[mode],
      webkitMaskImage: FEATHER[mode],
      pointerEvents: 'none',
    });
  };
  place();
  cover.appendChild(video);
  cover.style.cursor = 'pointer';

  let raf = 0;
  let flying = false;
  let dropped = false;
  let finished = false;
  let holdStartedAt = 0;
  let lastTime = -1;
  let lastProgressAt = performance.now();
  const startedAt = performance.now();

  // The flight keeps its own clock, so a click or a key can run the rest of it faster.
  let flightMs = 0;
  let flightRate = 1;
  let flightFrameAt = 0;
  let canvas: HTMLCanvasElement | undefined;
  let context: CanvasRenderingContext2D | null = null;
  const tierMotion: Animation[] = [];
  let mirrorOpen = false;

  const sizeCanvas = (): void => {
    if (!canvas) return;
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  const onResize = (): void => {
    place();
    sizeCanvas();
  };
  addEventListener('resize', onResize);

  const finish = (): void => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', onResize);
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
    if (flying || dropped || finished) return;
    dropped = true;
    state.phase = 'dropped';
    state.reason = reason;
    reveal(state);
    cover.style.pointerEvents = 'none';
    const fade = cover.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: LAUNCH_DURATIONS.drop, fill: 'forwards' });
    if (fade) fade.onfinish = finish;
    else finish();
  };

  // The mirror opens: the wallet shows through it, far off, and each of its tiers flies up about the focus. The
  // browser runs these on its own clock, so they stay smooth while the wallet is still drawing its first screen.
  const openMirror = (): void => {
    mirrorOpen = true;
    reveal(state);
    const tiers = collectTiers();
    if (!tiers.length || !tiers[0].element.animate) return;
    const samples = FLIGHT.samples.tiers;
    for (const tier of tiers) {
      aimAt(tier, framing.focus);
      const scales = samples[tier.depth];
      const fly = tier.element.animate(
        scales.map((scale, index) => ({ scale: String(scale), offset: index / (scales.length - 1) })),
        { duration: FLIGHT.durationMs, easing: 'linear' }
      );
      const show = tier.element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FLIGHT.tierFadeMs,
        delay: FLIGHT.irisAtMs + tier.depth * FLIGHT.tierStaggerMs,
        fill: 'backwards',
      });
      for (const motion of [fly, show]) {
        motion.currentTime = flightMs;
        motion.playbackRate = flightRate;
        tierMotion.push(motion);
      }
      fly.onfinish = () => tier.element.style.removeProperty('transform-origin');
    }
  };

  const fly = (now: number): void => {
    raf = 0;
    if (finished) return;
    flightMs += (now - flightFrameAt) * flightRate;
    flightFrameAt = now;
    const { focus } = framing;
    const side = Math.min(innerWidth, innerHeight);
    const iris = irisRadius(flightMs, side);
    if (context) drawFlight(context, { flightMs, cx: focus.x, cy: focus.y, side, width: innerWidth, height: innerHeight, iris });
    if (iris > 0) {
      if (!mirrorOpen) openMirror();
      // The opening through the overlay: the wallet is seen inside the mirror's rim.
      const mask = `radial-gradient(circle ${iris.toFixed(1)}px at ${focus.x.toFixed(1)}px ${focus.y.toFixed(1)}px, transparent 0, transparent calc(100% - 1.5px), #000 100%)`;
      cover.style.maskImage = mask;
      cover.style.setProperty('-webkit-mask-image', mask);
    }
    const farthest = Math.hypot(Math.max(focus.x, innerWidth - focus.x), Math.max(focus.y, innerHeight - focus.y));
    // The opening has cleared the view (or the flight is over): nothing of the overlay is left to see.
    if (flightMs >= FLIGHT.durationMs || iris > farthest + 2) {
      if (!mirrorOpen) openMirror();
      finish();
      return;
    }
    raf = requestAnimationFrame(fly);
  };

  const startFlight = (fast: boolean): void => {
    if (flying || dropped || finished) return;
    flying = true;
    state.phase = 'flying';
    if (fast) hurry();
    cancelAnimationFrame(raf);
    canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    context = canvas.getContext('2d');
    sizeCanvas();
    cover.appendChild(canvas);
    // The clip runs on under the gates to its last frame, the glow, and stays there.
    if (video.paused && !video.ended) void video.play().catch(() => undefined);
    flightFrameAt = performance.now();
    raf = requestAnimationFrame(fly);
  };

  // A click or a key plays the rest of the flight faster; before the flight, it starts at once.
  const hurry = (): void => {
    flightRate = LAUNCH_SKIP_RATE;
    state.reason = 'skipped';
    for (const motion of tierMotion) motion.playbackRate = flightRate;
  };
  const skip = (): void => {
    if (dropped || finished) return;
    if (flying) hurry();
    else startFlight(true);
  };
  // It is the click, not the press, so the release cannot land on the wallet; the overlay takes clicks to its end.
  const onClick = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    skip();
  };
  // A key skips as well and still reaches the page: a password field under the overlay gets the typing.
  const onKey = (): void => skip();
  cover.addEventListener('click', onClick);
  addEventListener('keydown', onKey, true);
  // A hidden side panel stops the frames; coming back is not a stall, and the flight does not jump ahead.
  document.addEventListener('visibilitychange', () => {
    lastProgressAt = performance.now();
    flightFrameAt = performance.now();
  });

  const tick = (): void => {
    raf = 0;
    if (finished || flying || dropped) return;
    const now = performance.now();
    const time = video.currentTime;
    if (time !== lastTime) {
      lastTime = time;
      lastProgressAt = now;
    }
    if (time >= LAUNCH_TIMES.hold && !ready()) {
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
    if (time >= LAUNCH_TIMES.flight || video.ended) {
      startFlight(false);
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
  video.addEventListener('ended', () => startFlight(false));
  state.phase = 'playing';
  void video.play().then(
    () => {
      if (!raf && !flying) raf = requestAnimationFrame(tick);
    },
    () => drop('play refused')
  );
  raf = requestAnimationFrame(tick);
}
