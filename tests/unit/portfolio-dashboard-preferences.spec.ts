import {
  DASHBOARD_PREFERENCES_KEY,
  MAX_SLOT_MAPS,
  defaultPreferences,
  readPreferences,
  sanitizePreferences,
  slotMapKey,
  withSlots,
  writePreferences,
  type PreferencesStorage,
} from '@/portfolio/dashboard/preferences';

const memoryStorage = (initial?: unknown): PreferencesStorage & { stored: Record<string, unknown> } => {
  const stored: Record<string, unknown> = initial === undefined ? {} : { [DASHBOARD_PREFERENCES_KEY]: initial };

  return { stored, get: (key) => ({ value: stored[key] }), set: (key, value) => void (stored[key] = value) };
};

describe('dashboard preferences', () => {
  it('start as All wallets by tokens, with no colours kept', () => {
    expect(readPreferences(memoryStorage())).toEqual({ scope: 'all', lens: 'token', slots: {} });
  });

  it('remember what was written', () => {
    const storage = memoryStorage();
    const preferences = { scope: 'wallet' as const, lens: 'wallet' as const, slots: { 'all:token': { a: 1, b: 2 } } };

    writePreferences(storage, preferences);

    expect(readPreferences(storage)).toEqual(preferences);
  });

  it('fall back to the default for any field that is not valid, and keep the valid ones', () => {
    expect(sanitizePreferences({ scope: 'everywhere', lens: 'network', slots: 'many' })).toEqual({ scope: 'all', lens: 'network', slots: {} });
    expect(sanitizePreferences(null)).toEqual(defaultPreferences());
    expect(sanitizePreferences([1, 2])).toEqual(defaultPreferences());
    expect(sanitizePreferences('wallet')).toEqual(defaultPreferences());
  });

  it('drop slots that are out of range, fractional, repeated or not numbers', () => {
    const { slots } = sanitizePreferences({
      slots: { map: { a: 1, b: 0, c: 6, d: 2.5, e: '3', f: 1, g: 4 }, empty: { x: 9 }, junk: 4 },
    });

    expect(slots).toEqual({ map: { a: 1, g: 4 } });
  });

  it('start from the defaults when the storage throws', () => {
    const broken: PreferencesStorage = {
      get: () => {
        throw new Error('blocked');
      },
      set: () => {
        throw new Error('blocked');
      },
    };

    expect(readPreferences(broken)).toEqual(defaultPreferences());
    expect(() => writePreferences(broken, defaultPreferences())).not.toThrow();
  });

  it('keep a slot map per scope, lens and wallet', () => {
    expect(slotMapKey('all', 'token', 'addr')).toBe('all:token');
    expect(slotMapKey('wallet', 'network', 'addr')).toBe('wallet:addr:network');
  });

  describe('withSlots', () => {
    it('returns the same preferences when the stored map already equals the new one', () => {
      const preferences = withSlots(defaultPreferences(), 'all:token', { a: 1 });

      expect(withSlots(preferences, 'all:token', { a: 1 })).toBe(preferences);
      expect(withSlots(preferences, 'all:token', { a: 2 })).not.toBe(preferences);
    });

    it('does not touch the other maps, and puts the newest last', () => {
      let preferences = withSlots(defaultPreferences(), 'first', { a: 1 });

      preferences = withSlots(preferences, 'second', { b: 1 });
      preferences = withSlots(preferences, 'first', { a: 2 });

      expect(Object.keys(preferences.slots)).toEqual(['second', 'first']);
      expect(preferences.slots.second).toEqual({ b: 1 });
    });

    it('forgets the oldest maps past the cap', () => {
      let preferences = defaultPreferences();

      for (let index = 0; index < MAX_SLOT_MAPS + 5; index += 1) preferences = withSlots(preferences, `map-${index}`, { a: 1 });

      const keys = Object.keys(preferences.slots);

      expect(keys).toHaveLength(MAX_SLOT_MAPS);
      expect(keys[0]).toBe('map-5');
      expect(keys.at(-1)).toBe(`map-${MAX_SLOT_MAPS + 4}`);
    });
  });
});
