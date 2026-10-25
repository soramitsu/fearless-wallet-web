import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EFFECTS_MEDIA_QUERIES,
  VISUAL_EFFECTS_STORAGE_KEY,
  VisualEffects,
  extensionPreferenceStore,
  isLowEndDevice,
  readMirroredPreference,
  resolveVisualEffects,
  sampleFrameInterval,
  type EffectsSignals,
  type PreferenceStore,
  type VisualEffectsOptions,
} from '@/appearance/visualEffects';

const MIRROR = 'ui_visual-effects-v1';
const root = document.documentElement;
const none: EffectsSignals = {
  reducedTransparency: false,
  moreContrast: false,
  forcedColors: false,
  lowEndDevice: false,
  jank: false,
};
const desktop = { deviceMemory: 8, hardwareConcurrency: 8 };

type Change = (event: { matches: boolean }) => void;

/** A system whose media features can be flipped while the page is open. */
function fakeMedia(initial: Partial<Record<keyof typeof EFFECTS_MEDIA_QUERIES, boolean>> = {}) {
  const queries = Object.fromEntries(Object.entries(EFFECTS_MEDIA_QUERIES).map(([signal, query]) => [query, signal]));
  const lists = new Map<string, { matches: boolean; listeners: Change[] }>();
  const matchMedia = (query: string) => {
    const signal = queries[query] as keyof typeof EFFECTS_MEDIA_QUERIES;
    const list = lists.get(query) ?? { matches: Boolean(initial[signal]), listeners: [] };

    lists.set(query, list);

    return {
      get matches() {
        return list.matches;
      },
      addEventListener: (_type: string, listener: Change) => list.listeners.push(listener),
    };
  };
  const set = (signal: keyof typeof EFFECTS_MEDIA_QUERIES, matches: boolean) => {
    const list = lists.get(EFFECTS_MEDIA_QUERIES[signal]);

    if (!list) throw new Error(`${signal} was never queried`);
    list.matches = matches;
    list.listeners.forEach((listener) => listener({ matches }));
  };

  return { matchMedia: matchMedia as unknown as VisualEffectsOptions['matchMedia'], set };
}

/** `chrome.storage.local` as the extension sees it: a key/value record with change events to every page. */
function fakeChromeStorage(initial: Record<string, unknown> = {}) {
  const records: Record<string, unknown> = structuredClone(initial);
  const listeners: ((changes: Record<string, { newValue?: unknown }>, area: string) => void)[] = [];
  const local = {
    get: vi.fn(async (key: string) => (key in records ? { [key]: structuredClone(records[key]) } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(records, structuredClone(items));
      const changes = Object.fromEntries(Object.entries(items).map(([key, newValue]) => [key, { newValue }]));
      listeners.forEach((listener) => listener(changes, 'local'));
    }),
  };
  const api = {
    storage: {
      local,
      onChanged: {
        addListener: vi.fn((listener: (typeof listeners)[number]) => listeners.push(listener)),
        removeListener: vi.fn(),
      },
    },
  };
  const emit = (changes: Record<string, { newValue?: unknown }>, area = 'local') =>
    listeners.forEach((listener) => listener(changes, area));

  return { api, local, records, emit };
}

const attributes = () => ({ effects: root.dataset.fwEffects, contrast: root.dataset.fwContrast });
const create = (options: VisualEffectsOptions = {}) =>
  new VisualEffects({ root, device: desktop, matchMedia: fakeMedia().matchMedia, ...options });

beforeEach(() => {
  localStorage.clear();
  delete root.dataset.fwEffects;
  delete root.dataset.fwContrast;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('effects resolution (design-system 2.1-2.2)', () => {
  it('gives Full by default and follows the system and the device under Automatic', () => {
    expect(resolveVisualEffects('auto', none)).toEqual({ effects: 'full', contrast: 'standard' });
    expect(resolveVisualEffects('auto', { ...none, reducedTransparency: true })).toEqual({
      effects: 'reduced',
      contrast: 'standard',
    });
    expect(resolveVisualEffects('auto', { ...none, forcedColors: true }).effects).toBe('reduced');
    expect(resolveVisualEffects('auto', { ...none, lowEndDevice: true }).effects).toBe('lite');
    expect(resolveVisualEffects('auto', { ...none, jank: true }).effects).toBe('lite');
    // Reduced transparency is stronger than a slow device.
    expect(resolveVisualEffects('auto', { ...none, lowEndDevice: true, reducedTransparency: true }).effects).toBe(
      'reduced'
    );
  });

  it('lets a picked tier win over transparency, device and jank signals', () => {
    expect(resolveVisualEffects('lite', { ...none, reducedTransparency: true }).effects).toBe('lite');
    expect(resolveVisualEffects('reduced', none).effects).toBe('reduced');
    expect(resolveVisualEffects('reduced', { ...none, lowEndDevice: true, jank: true }).effects).toBe('reduced');
  });

  it('keeps Reduced paint whenever the system asks for more contrast or forced colours, whatever was picked', () => {
    for (const preference of ['auto', 'lite', 'reduced'] as const) {
      expect(resolveVisualEffects(preference, { ...none, moreContrast: true })).toEqual({
        effects: 'reduced',
        contrast: 'high',
      });
      expect(resolveVisualEffects(preference, { ...none, forcedColors: true })).toEqual({
        effects: 'reduced',
        contrast: 'standard',
      });
    }
  });

  it('treats only a known small memory or core count as a low-end device', () => {
    expect(isLowEndDevice({ deviceMemory: 2, hardwareConcurrency: 8 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 2 })).toBe(true);
    expect(isLowEndDevice(desktop)).toBe(false);
    // Firefox has no deviceMemory; an unknown value never downgrades.
    expect(isLowEndDevice({ hardwareConcurrency: 8 })).toBe(false);
    expect(isLowEndDevice({ hardwareConcurrency: 0 })).toBe(false);
    expect(isLowEndDevice(undefined)).toBe(false);
  });
});

describe('before mount', () => {
  it('puts Automatic at Full on <html> synchronously when nothing is stored', () => {
    create();

    expect(attributes()).toEqual({ effects: 'full', contrast: 'standard' });
  });

  it('applies the mirrored choice synchronously, before the canonical store answers', () => {
    localStorage.setItem(MIRROR, JSON.stringify({ value: 'reduced' }));
    const store: PreferenceStore = { read: () => new Promise(() => undefined), write: vi.fn() };

    create({ store });

    expect(attributes()).toEqual({ effects: 'reduced', contrast: 'standard' });
  });

  it('applies the system contrast and transparency signals before mount', () => {
    create({ matchMedia: fakeMedia({ moreContrast: true }).matchMedia });
    expect(attributes()).toEqual({ effects: 'reduced', contrast: 'high' });

    create({ matchMedia: fakeMedia({ reducedTransparency: true }).matchMedia });
    expect(attributes()).toEqual({ effects: 'reduced', contrast: 'standard' });

    create({ device: { deviceMemory: 1 } });
    expect(attributes()).toEqual({ effects: 'lite', contrast: 'standard' });
  });

  it('reads a malformed or unknown mirror as Automatic and leaves it as it was', () => {
    for (const raw of ['not json', JSON.stringify({ value: 'ultra' }), JSON.stringify({ value: 42 }), '{}', 'null']) {
      localStorage.setItem(MIRROR, raw);

      create();

      expect(attributes().effects).toBe('full');
      expect(localStorage.getItem(MIRROR)).toBe(raw);
    }
  });

  it('starts at Automatic when localStorage itself throws (blocked site data)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });

    expect(readMirroredPreference()).toBe('auto');
    expect(() => create()).not.toThrow();
    expect(attributes().effects).toBe('full');
  });
});

describe('the canonical chrome.storage.local record', () => {
  it('wins over a stale mirror and refreshes it', async () => {
    localStorage.setItem(MIRROR, JSON.stringify({ value: 'lite' }));
    const chrome = fakeChromeStorage({ [VISUAL_EFFECTS_STORAGE_KEY]: 'reduced' });

    const effects = create({ store: extensionPreferenceStore(chrome.api) });
    expect(attributes().effects).toBe('lite');
    await effects.ready;

    expect(attributes().effects).toBe('reduced');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'reduced' });
    expect(chrome.local.set).not.toHaveBeenCalled();
  });

  it('keeps the mirror, and writes nothing, when the record is missing, unknown or unreadable', async () => {
    for (const store of [
      extensionPreferenceStore(fakeChromeStorage().api),
      extensionPreferenceStore(fakeChromeStorage({ [VISUAL_EFFECTS_STORAGE_KEY]: 'ultra' }).api),
      { read: () => Promise.reject(new Error('IO error')), write: vi.fn() } as PreferenceStore,
    ]) {
      localStorage.setItem(MIRROR, JSON.stringify({ value: 'lite' }));
      const setItem = vi.spyOn(Storage.prototype, 'setItem');

      await create({ store }).ready;

      expect(attributes().effects).toBe('lite');
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    }
  });

  it('never lets a read that started before a choice undo the choice', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const store: PreferenceStore = {
      read: () => new Promise((resolve) => (answer = resolve)),
      write: vi.fn(async () => undefined),
    };
    const effects = create({ store });

    await effects.choose('reduced');
    answer('lite');
    await effects.ready;

    expect(effects.state.preference).toBe('reduced');
    expect(attributes().effects).toBe('reduced');
  });

  it('saves a choice as its own key, applies it at once and updates the mirror', async () => {
    const chrome = fakeChromeStorage({ 'fw:account:0x01': { encoded: 'secret' } });
    const effects = create({ store: extensionPreferenceStore(chrome.api) });
    const seen: string[] = [];
    effects.subscribe(({ effects: tier }) => seen.push(tier));

    const saving = effects.choose('lite');
    expect(attributes().effects).toBe('lite');
    await saving;

    expect(chrome.local.set).toHaveBeenCalledExactlyOnceWith({ [VISUAL_EFFECTS_STORAGE_KEY]: 'lite' });
    expect(chrome.records).toEqual({ 'fw:account:0x01': { encoded: 'secret' }, [VISUAL_EFFECTS_STORAGE_KEY]: 'lite' });
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'lite' });
    expect(seen).toEqual(['lite']);
  });

  it('keeps a choice for this page and in the mirror when the canonical write fails', async () => {
    const store: PreferenceStore = { read: async () => undefined, write: () => Promise.reject(new Error('QUOTA')) };
    const effects = create({ store });

    await expect(effects.choose('reduced')).rejects.toThrow('QUOTA');

    expect(attributes().effects).toBe('reduced');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'reduced' });
  });

  it('follows a choice made in another extension page', async () => {
    const chrome = fakeChromeStorage();
    const effects = create({ store: extensionPreferenceStore(chrome.api) });
    await effects.ready;

    chrome.emit({ [VISUAL_EFFECTS_STORAGE_KEY]: { newValue: 'reduced' } });
    expect(attributes().effects).toBe('reduced');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'reduced' });

    // Other keys, other areas and unknown values change nothing.
    chrome.emit({ 'fw:keyring': { newValue: {} } });
    chrome.emit({ [VISUAL_EFFECTS_STORAGE_KEY]: { newValue: 'lite' } }, 'sync');
    chrome.emit({ [VISUAL_EFFECTS_STORAGE_KEY]: { newValue: 'ultra' } });
    expect(effects.state.preference).toBe('reduced');
  });

  it('is absent outside the extension, where the web wallet keeps the choice in localStorage', async () => {
    expect(extensionPreferenceStore(undefined)).toBeUndefined();
    expect(extensionPreferenceStore({})).toBeUndefined();

    const effects = create();
    await effects.choose('lite');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'lite' });

    const reopened = create();
    expect(reopened.state.preference).toBe('lite');
  });

  it('follows a mirror written by another tab of the web wallet', () => {
    const effects = create({ window });

    localStorage.setItem(MIRROR, JSON.stringify({ value: 'reduced' }));
    window.dispatchEvent(new StorageEvent('storage', { key: MIRROR }));
    expect(effects.state.preference).toBe('reduced');

    localStorage.setItem(MIRROR, JSON.stringify({ value: 'lite' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'account_lang' }));
    expect(effects.state.preference).toBe('reduced');
  });
});

describe('live system changes', () => {
  it('re-resolves when the system contrast, transparency or forced colours change', () => {
    const media = fakeMedia();
    const effects = create({ matchMedia: media.matchMedia });
    const seen: string[] = [];
    effects.subscribe(({ effects: tier, contrast }) => seen.push(`${tier}/${contrast}`));

    media.set('moreContrast', true);
    expect(attributes()).toEqual({ effects: 'reduced', contrast: 'high' });
    media.set('moreContrast', false);
    media.set('reducedTransparency', true);
    expect(attributes()).toEqual({ effects: 'reduced', contrast: 'standard' });
    media.set('reducedTransparency', false);
    media.set('forcedColors', true);
    media.set('forcedColors', false);

    expect(seen).toEqual([
      'reduced/high',
      'full/standard',
      'reduced/standard',
      'full/standard',
      'reduced/standard',
      'full/standard',
    ]);
  });

  it('keeps working without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(() => new VisualEffects({ root, device: desktop })).not.toThrow();
    expect(attributes()).toEqual({ effects: 'full', contrast: 'standard' });
  });
});

describe('auto-Lite on jank', () => {
  const frames = (intervals: number[]) => {
    let time = 1000;
    let index = 0;

    return (callback: FrameRequestCallback) => {
      const now = time;
      time += intervals[index++ % intervals.length];
      queueMicrotask(() => callback(now));

      return index;
    };
  };

  it('reports the median frame interval of the first three seconds', async () => {
    await expect(sampleFrameInterval(3000, frames([1000 / 60]))).resolves.toBeCloseTo(16.67, 1);
    await expect(sampleFrameInterval(3000, frames([1000 / 30]))).resolves.toBeCloseTo(33.33, 1);
    // A few long frames while data loads do not make a smooth popup "janky".
    await expect(sampleFrameInterval(3000, frames([16, 16, 16, 16, 400]))).resolves.toBe(16);
  });

  it('drops Automatic to Lite for the page when the popup draws below 50 fps', async () => {
    const slow = create({ sampleFrames: async () => 33 });
    expect(attributes().effects).toBe('full');
    await vi.waitFor(() => expect(attributes().effects).toBe('lite'));
    expect(slow.state.signals.jank).toBe(true);
    // Session only: nothing is stored.
    expect(localStorage.getItem(MIRROR)).toBeNull();

    create({ sampleFrames: async () => 16.7 });
    await Promise.resolve();
    await Promise.resolve();
    expect(attributes().effects).toBe('full');
  });

  it('samples only when Automatic resolved to Full', () => {
    const sampleFrames = vi.fn(async () => 40);

    localStorage.setItem(MIRROR, JSON.stringify({ value: 'reduced' }));
    create({ sampleFrames });
    localStorage.setItem(MIRROR, JSON.stringify({ value: 'auto' }));
    create({ sampleFrames, device: { deviceMemory: 1 } });
    create({ sampleFrames, matchMedia: fakeMedia({ reducedTransparency: true }).matchMedia });

    expect(sampleFrames).not.toHaveBeenCalled();
  });
});

describe('upgrades from shipped builds', () => {
  const readJson = (path: string) => JSON.parse(readFileSync(resolve(__dirname, '../..', path), 'utf8'));
  const shippedStorage = [
    'tests/fixtures/upgrade/chrome-3.0.5-master-password.storage.json',
    'tests/fixtures/upgrade/chrome-3.0.5-password-changed.storage.json',
    'tests/fixtures/upgrade/chrome-2.6.3-account-passwords.storage.json',
    'tests/fixtures/upgrade/s1-2.6.3-per-account-passwords.json',
    'tests/fixtures/upgrade/s2-3.0.6-ecdsa.json',
  ].map((path) => ({ path, storage: readJson(path).storage as Record<string, unknown> }));
  const shippedLocalStorage = [
    'tests/fixtures/legacy-305/localStorage-305.evm-standalone.json',
    'tests/fixtures/legacy-305/localStorage-305.hide-zero.json',
    'tests/fixtures/legacy-305/localStorage-305.switches.json',
    'tests/fixtures/legacy-305/localStorage-305.ton.json',
  ].map((path) => readJson(path).localStorage as Record<string, string>);

  it('opens a shipped profile at Automatic and writes nothing to either store', async () => {
    for (const { path, storage } of shippedStorage) {
      for (const pageStorage of shippedLocalStorage) {
        localStorage.clear();
        Object.entries(pageStorage).forEach(([key, value]) => localStorage.setItem(key, value));
        const chrome = fakeChromeStorage(storage);
        const setItem = vi.spyOn(Storage.prototype, 'setItem');

        const effects = create({ store: extensionPreferenceStore(chrome.api) });
        await effects.ready;

        expect(effects.state.preference, path).toBe('auto');
        expect(attributes(), path).toEqual({ effects: 'full', contrast: 'standard' });
        expect(chrome.local.set, path).not.toHaveBeenCalled();
        expect(chrome.records, path).toEqual(storage);
        expect(setItem, path).not.toHaveBeenCalled();
        setItem.mockRestore();
      }
    }
  });

  it('stores a later choice beside the wallet records without touching any of them', async () => {
    for (const { path, storage } of shippedStorage) {
      // The key is outside every prefix the background stores read: accounts and keyring (`fw:`), the
      // prefixed stores (`fwauthorize:`, `fwcurrent_account:`, ...) and WalletConnect (`wc@2:`).
      expect(
        Object.keys(storage).some((key) => VISUAL_EFFECTS_STORAGE_KEY.startsWith(key.split(':')[0])),
        path
      ).toBe(false);
      expect(VISUAL_EFFECTS_STORAGE_KEY.startsWith('fw')).toBe(false);
      expect(VISUAL_EFFECTS_STORAGE_KEY.startsWith('wc@')).toBe(false);

      const chrome = fakeChromeStorage(storage);
      await create({ store: extensionPreferenceStore(chrome.api) }).choose('reduced');

      const { [VISUAL_EFFECTS_STORAGE_KEY]: stored, ...rest } = chrome.records;
      expect(stored, path).toBe('reduced');
      expect(rest, path).toEqual(storage);
    }
  });
});
