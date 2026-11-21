// A copied recovery phrase or key leaves the clipboard again; anything copied since stays.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SECRET_CLIPBOARD_LIFETIME_MS,
  SECRET_CLIPBOARD_MARKER,
  clearCopiedSecret,
  copySecretToClipboard,
} from '@/util/clipboardSecret';

const PHRASE = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk';
let clipboard = '';
let readable = true;
const session = new Map<string, unknown>();

beforeEach(() => {
  clipboard = '';
  readable = true;
  session.clear();
  vi.useFakeTimers();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: vi.fn(async (text: string) => { clipboard = text; }),
    readText: vi.fn(async () => { if (!readable) throw new Error('Document is not focused'); return clipboard; }),
  } });
  (globalThis as { chrome?: unknown }).chrome = { storage: { session: {
    get: async (key: string) => (session.has(key) ? { [key]: session.get(key) } : {}),
    set: async (items: Record<string, unknown>) => { Object.entries(items).forEach(([key, value]) => session.set(key, value)); },
    remove: async (key: string) => { session.delete(key); },
  } } };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { chrome?: unknown }).chrome;
});

describe('secret clipboard', () => {
  it('clears the copied phrase after a minute, keeping only its SHA-256', async () => {
    await copySecretToClipboard(PHRASE);
    expect(clipboard).toBe(PHRASE);
    expect(String(session.get(SECRET_CLIPBOARD_MARKER))).toMatch(/^[0-9a-f]{64}$/u);
    expect(JSON.stringify([...session])).not.toContain('bottom');
    await vi.advanceTimersByTimeAsync(SECRET_CLIPBOARD_LIFETIME_MS - 1);
    expect(clipboard).toBe(PHRASE);
    await vi.advanceTimersByTimeAsync(1);
    // The clear hashes the clipboard with WebCrypto, which settles outside the fake clock.
    await vi.waitFor(() => expect(clipboard).toBe(''));
    expect(session.has(SECRET_CLIPBOARD_MARKER)).toBe(false);
  });

  it('leaves what the user copied since', async () => {
    await copySecretToClipboard(PHRASE);
    clipboard = '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty';
    await clearCopiedSecret();
    expect(clipboard).toBe('5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty');
    expect(session.has(SECRET_CLIPBOARD_MARKER)).toBe(false);
  });

  it('tries again when the wallet next opens if the clipboard could not be read', async () => {
    await copySecretToClipboard(PHRASE);
    readable = false;
    await vi.advanceTimersByTimeAsync(SECRET_CLIPBOARD_LIFETIME_MS);
    expect(clipboard).toBe(PHRASE);
    expect(session.has(SECRET_CLIPBOARD_MARKER)).toBe(true);
    readable = true;
    await clearCopiedSecret();
    expect(clipboard).toBe('');
  });
});
