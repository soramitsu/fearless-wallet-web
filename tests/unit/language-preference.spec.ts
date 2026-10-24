import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountController } from '@/controllers/accountController';
import { isLang, resolveLang } from '@/locales/languages';

const createLocalStorageStub = () => {
  const storage = new Map<string, string>();

  return {
    clear: vi.fn(() => storage.clear()),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    get length() {
      return storage.size;
    },
  };
};

const storageKey = 'account_lang';
const storeLang = (value: unknown) => localStorage.setItem(storageKey, JSON.stringify({ value }));
const storedLang = () => JSON.parse(localStorage.getItem(storageKey) ?? '{}').value;

describe('language preference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageStub());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps an Old Akkadian choice saved by builds that used the transliteration tag', () => {
    storeLang('akk-Latn-x-old');

    expect(accountController.getLang()).toBe('akk-Xsux-x-old');
    expect(storedLang()).toBe('akk-Xsux-x-old');
    // The rewrite is idempotent.
    expect(accountController.getLang()).toBe('akk-Xsux-x-old');
    expect(storedLang()).toBe('akk-Xsux-x-old');
  });

  it('returns current tags unchanged without rewriting them', () => {
    for (const lang of ['en-EN', 'ru-RU', 'akk-Xsux-x-old', 'egy-Egyp']) {
      const raw = JSON.stringify({ value: lang });
      localStorage.setItem(storageKey, raw);

      expect(accountController.getLang()).toBe(lang);
      expect(localStorage.getItem(storageKey)).toBe(raw);
    }
  });

  it('falls back to English for missing or unknown values without discarding them', () => {
    expect(accountController.getLang()).toBe('en-EN');
    expect(localStorage.getItem(storageKey)).toBeNull();

    storeLang('xx-Unknown');

    expect(accountController.getLang()).toBe('en-EN');
    expect(storedLang()).toBe('xx-Unknown');
  });

  it('only resolves the retired tag as an alias, never as a selectable language', () => {
    expect(isLang('akk-Latn-x-old')).toBe(false);
    expect(resolveLang('akk-Latn-x-old')).toBe('akk-Xsux-x-old');
    expect(resolveLang('egy-Egyp')).toBe('egy-Egyp');
    expect(resolveLang('toString')).toBeUndefined();
    expect(resolveLang(undefined)).toBeUndefined();
    expect(resolveLang(42)).toBeUndefined();
  });
});
