import { LocalStorage } from '@/controllers/localStorageController';

/**
 * Visual effects tier and contrast for the Neon Glass styles (design-system 2.1-2.2).
 *
 * The page entry resolves them into `<html data-fw-effects="full|lite|reduced" data-fw-contrast="standard|high">`
 * before the app mounts, so CSS is the only place a tier changes paint. The user's choice (Settings → Visual
 * effects: Automatic, Lite or Reduced) is an ordinary UI preference: never in secret stores, never under the
 * keyring's `fw:` prefix. In the extension it is kept in `chrome.storage.local` with a synchronous `localStorage`
 * mirror, because the extension CSP forbids an inline boot script and `chrome.storage` cannot be read before
 * mount; the web wallet keeps it in `localStorage` only. Starting up only reads: a missing, malformed or unknown
 * stored value reads as Automatic and is left as it is.
 */
export type VisualEffectsPreference = 'auto' | 'lite' | 'reduced';
export type EffectsTier = 'full' | 'lite' | 'reduced';
export type ContrastLevel = 'standard' | 'high';

export interface EffectsSignals {
  /** `(prefers-reduced-transparency: reduce)`; Chrome 118+, so the in-app choice covers Chrome 116-117 and Firefox. */
  reducedTransparency: boolean;
  /** `(prefers-contrast: more)`. */
  moreContrast: boolean;
  /** `(forced-colors: active)`. */
  forcedColors: boolean;
  /** `navigator.deviceMemory <= 2` or `navigator.hardwareConcurrency <= 2`. */
  lowEndDevice: boolean;
  /** Frames sampled during the first seconds after open ran below 50 fps; lasts for this page only. */
  jank: boolean;
}

export interface ResolvedEffects {
  effects: EffectsTier;
  contrast: ContrastLevel;
}

export interface VisualEffectsState extends ResolvedEffects {
  preference: VisualEffectsPreference;
  signals: EffectsSignals;
}

/** Where the extension keeps the choice; the popup reads it after mount and keeps the mirror in step. */
export interface PreferenceStore {
  read(): Promise<unknown>;
  write(preference: VisualEffectsPreference): Promise<void>;
  subscribe?(listener: (value: unknown) => void): () => void;
}

export const VISUAL_EFFECTS_PREFERENCES: readonly VisualEffectsPreference[] = ['auto', 'lite', 'reduced'];
/** The `chrome.storage.local` key. Outside the keyring's `fw:` prefix, so no account store ever reads it. */
export const VISUAL_EFFECTS_STORAGE_KEY = 'visualEffectsPreference';
/** The synchronous mirror, `ui_visual-effects-v1` in `localStorage` (`LocalStorage` value format). */
export const VISUAL_EFFECTS_MIRROR_KEY = 'visual-effects-v1';
const MIRROR_PREFIX = 'ui_';

export const EFFECTS_MEDIA_QUERIES = {
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  moreContrast: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
} as const;

/** The first seconds after open, sampled once per page (design-system 2.2, auto-Lite on jank). */
export const JANK_SAMPLE_MS = 3000;
/** A median frame longer than this is below 50 fps. The median ignores the few long frames of loading data. */
export const JANK_FRAME_MS = 20;

const mirror = new LocalStorage(MIRROR_PREFIX);

export const parseVisualEffectsPreference = (value: unknown): VisualEffectsPreference | undefined =>
  VISUAL_EFFECTS_PREFERENCES.find((preference) => preference === value);

/**
 * High contrast and forced colours always mean Reduced paint: their text and edge values assume opaque surfaces.
 * Otherwise a choice of Lite or Reduced wins, and Automatic follows the system and the device.
 */
export function resolveVisualEffects(preference: VisualEffectsPreference, signals: EffectsSignals): ResolvedEffects {
  const contrast: ContrastLevel = signals.moreContrast ? 'high' : 'standard';

  if (signals.moreContrast || signals.forcedColors) return { effects: 'reduced', contrast };
  if (preference !== 'auto') return { effects: preference, contrast };
  if (signals.reducedTransparency) return { effects: 'reduced', contrast };
  if (signals.lowEndDevice || signals.jank) return { effects: 'lite', contrast };

  return { effects: 'full', contrast };
}

/** The mirrored choice, read synchronously before mount. Storage that is missing or throws reads as Automatic. */
export function readMirroredPreference(): VisualEffectsPreference {
  try {
    return parseVisualEffectsPreference(mirror.get(VISUAL_EFFECTS_MIRROR_KEY).value) ?? 'auto';
  } catch {
    return 'auto';
  }
}

function writeMirror(preference: VisualEffectsPreference): void {
  try {
    mirror.set(VISUAL_EFFECTS_MIRROR_KEY, preference);
  } catch {
    // The canonical store still has it; the next open restores the mirror.
  }
}

/** What the browser says about the device; `deviceMemory` is Chromium only. */
export type DeviceInfo = { deviceMemory?: number; hardwareConcurrency?: number };

export function isLowEndDevice(device: DeviceInfo | undefined = globalThis.navigator): boolean {
  const known = (value: unknown): value is number => typeof value === 'number' && value > 0;

  return (
    (known(device?.deviceMemory) && device.deviceMemory <= 2) ||
    (known(device?.hardwareConcurrency) && device.hardwareConcurrency <= 2)
  );
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/** Samples animation frames for `durationMs` and settles with the median frame interval, or undefined without frames. */
export function sampleFrameInterval(
  durationMs = JANK_SAMPLE_MS,
  frame: (callback: FrameRequestCallback) => number = (callback) => globalThis.requestAnimationFrame(callback)
): Promise<number | undefined> {
  return new Promise((resolve) => {
    const intervals: number[] = [];
    let start: number | undefined;
    let previous: number | undefined;

    const tick = (time: number) => {
      if (previous !== undefined) intervals.push(time - previous);
      start ??= time;
      previous = time;

      if (time - start >= durationMs) resolve(intervals.length ? median(intervals) : undefined);
      else frame(tick);
    };

    frame(tick);
  });
}

type MediaSource = (
  query: string
) => Pick<MediaQueryList, 'matches'> & Partial<Pick<MediaQueryList, 'addEventListener'>>;

export interface VisualEffectsOptions {
  root?: HTMLElement;
  /** The extension's canonical store; the web wallet passes none and keeps the choice in `localStorage`. */
  store?: PreferenceStore;
  matchMedia?: MediaSource;
  device?: DeviceInfo;
  /** Settles with the median frame interval of the first seconds; none skips the jank check. */
  sampleFrames?: () => Promise<number | undefined>;
  /** Mirror changes made by another page of the same origin. */
  window?: Pick<Window, 'addEventListener'>;
}

export class VisualEffects {
  private preference: VisualEffectsPreference;
  private readonly signals: EffectsSignals;
  private readonly listeners = new Set<(state: VisualEffectsState) => void>();
  private readonly root?: HTMLElement;
  private readonly store?: PreferenceStore;
  /** Bumped by every choice, so a canonical read that started earlier never undoes a newer choice. */
  private revision = 0;
  readonly ready: Promise<void>;

  constructor(options: VisualEffectsOptions = {}) {
    const media = options.matchMedia ?? defaultMatchMedia();
    const queries = Object.entries(EFFECTS_MEDIA_QUERIES) as [keyof typeof EFFECTS_MEDIA_QUERIES, string][];

    this.root = options.root ?? globalThis.document?.documentElement;
    this.store = options.store;
    this.preference = readMirroredPreference();
    this.signals = {
      reducedTransparency: false,
      moreContrast: false,
      forcedColors: false,
      lowEndDevice: isLowEndDevice(options.device),
      jank: false,
    };

    for (const [signal, query] of queries) {
      const list = media?.(query);

      this.signals[signal] = Boolean(list?.matches);
      list?.addEventListener?.('change', (event: MediaQueryListEvent) => {
        this.signals[signal] = event.matches;
        this.apply();
      });
    }

    this.apply();
    options.window?.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === `${MIRROR_PREFIX}${VISUAL_EFFECTS_MIRROR_KEY}`) this.adopt(readMirroredPreference());
    });
    this.store?.subscribe?.((value) => {
      const preference = parseVisualEffectsPreference(value);

      if (preference) this.adopt(preference, true);
    });
    this.ready = this.reconcile();
    this.watchFrames(options.sampleFrames);
  }

  get state(): VisualEffectsState {
    return {
      preference: this.preference,
      ...resolveVisualEffects(this.preference, this.signals),
      signals: { ...this.signals },
    };
  }

  subscribe(listener: (state: VisualEffectsState) => void): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  /** The user's choice: applied at once, then saved to the canonical store and its mirror. */
  async choose(preference: VisualEffectsPreference): Promise<void> {
    this.revision += 1;
    this.adopt(preference);

    try {
      await this.store?.write(preference);
    } finally {
      writeMirror(preference);
    }
  }

  private adopt(preference: VisualEffectsPreference, mirrorIt = false): void {
    if (mirrorIt) writeMirror(preference);
    if (preference === this.preference) return;

    this.preference = preference;
    this.apply();
  }

  private apply(): void {
    const state = this.state;

    if (this.root) {
      this.root.dataset.fwEffects = state.effects;
      this.root.dataset.fwContrast = state.contrast;
    }
    this.listeners.forEach((listener) => listener(state));
  }

  // The canonical value wins over the mirror; a missing or unknown one leaves the mirror as it is.
  private async reconcile(): Promise<void> {
    if (!this.store) return;

    const revision = this.revision;

    try {
      const preference = parseVisualEffectsPreference(await this.store.read());

      if (preference && revision === this.revision) this.adopt(preference, preference !== readMirroredPreference());
    } catch {
      // The mirror keeps working until the store can be read.
    }
  }

  private watchFrames(sampleFrames: VisualEffectsOptions['sampleFrames']): void {
    // Only Automatic at Full can drop to Lite, and only a visible page draws frames.
    if (!sampleFrames || this.state.effects !== 'full' || globalThis.document?.visibilityState === 'hidden') return;

    void sampleFrames()
      .then((interval) => {
        if (interval === undefined || interval <= JANK_FRAME_MS) return;

        this.signals.jank = true;
        this.apply();
      })
      .catch(() => undefined);
  }
}

function defaultMatchMedia(): MediaSource | undefined {
  return typeof globalThis.matchMedia === 'function' ? (query) => globalThis.matchMedia(query) : undefined;
}

type ExtensionStorage = {
  storage?: {
    local?: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
    onChanged?: {
      addListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
      removeListener(listener: (changes: Record<string, { newValue?: unknown }>, area: string) => void): void;
    };
  };
};

/** The extension's `chrome.storage.local` (or Firefox `browser.storage.local`) as the canonical store. */
export function extensionPreferenceStore(api: ExtensionStorage | undefined): PreferenceStore | undefined {
  const local = api?.storage?.local;
  const changed = api?.storage?.onChanged;

  if (!local) return undefined;

  return {
    read: async () => (await local.get(VISUAL_EFFECTS_STORAGE_KEY))?.[VISUAL_EFFECTS_STORAGE_KEY],
    // Writes only this key; every other record in the store is left untouched.
    write: (preference) => local.set({ [VISUAL_EFFECTS_STORAGE_KEY]: preference }),
    subscribe: changed
      ? (listener) => {
          const onChanged = (changes: Record<string, { newValue?: unknown }>, area: string) => {
            if (area === 'local' && Object.prototype.hasOwnProperty.call(changes, VISUAL_EFFECTS_STORAGE_KEY)) {
              listener(changes[VISUAL_EFFECTS_STORAGE_KEY].newValue);
            }
          };

          changed.addListener(onChanged);

          return () => changed.removeListener(onChanged);
        }
      : undefined,
  };
}

let installed: VisualEffects | undefined;

/** Called by each page entry before mount; later calls return the same instance. */
export function installVisualEffects(options: VisualEffectsOptions = {}): VisualEffects {
  installed ??= new VisualEffects({
    window: globalThis.window,
    sampleFrames: typeof globalThis.requestAnimationFrame === 'function' ? () => sampleFrameInterval() : undefined,
    ...options,
  });

  return installed;
}

/** The instance the page entry installed (a `localStorage`-only one if none was). */
export const visualEffects = (): VisualEffects => installed ?? installVisualEffects();

/** Test hook: forget the installed instance. */
export function resetVisualEffectsForTests(): void {
  installed = undefined;
}
