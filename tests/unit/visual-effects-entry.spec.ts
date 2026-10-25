import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boot = vi.hoisted(() => ({
  atStart: [] as Array<Record<string, string | undefined>>,
  records: {} as Record<string, unknown>,
}));

// The entries' only job besides the effects is starting the wallet: record what <html> said at that moment.
vi.mock('@/bootstrap/startup', () => ({
  startWallet: vi.fn(() => {
    boot.atStart.push({ ...document.documentElement.dataset });

    return Promise.resolve();
  }),
  prepareWebWorker: vi.fn(),
}));

vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in boot.records ? { [key]: boot.records[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(boot.records, items)),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));

const MIRROR = 'ui_visual-effects-v1';

beforeEach(() => {
  vi.resetModules();
  boot.atStart = [];
  boot.records = {};
  localStorage.clear();
  delete document.documentElement.dataset.fwEffects;
  delete document.documentElement.dataset.fwContrast;
});

afterEach(() => vi.unstubAllGlobals());

describe('page entries apply the effects before the app mounts', () => {
  it('the extension popup: mirror first, then the canonical chrome.storage.local choice', async () => {
    localStorage.setItem(MIRROR, JSON.stringify({ value: 'lite' }));
    boot.records = { visualEffectsPreference: 'reduced' };

    await import('@/extension/entry/popup');

    expect(boot.atStart).toEqual([{ fwEffects: 'lite', fwContrast: 'standard' }]);
    const { visualEffects } = await import('@/appearance/visualEffects');
    await visualEffects().ready;
    expect(document.documentElement.dataset.fwEffects).toBe('reduced');
    expect(JSON.parse(localStorage.getItem(MIRROR) ?? '{}')).toEqual({ value: 'reduced' });
  });

  it('the extension popup of a profile from a shipped build: Automatic, nothing written', async () => {
    boot.records = { 'fw:keyring': { passwordHash: '0xabc' }, myAddresses: ['5Grw'] };

    await import('@/extension/entry/popup');
    const { visualEffects } = await import('@/appearance/visualEffects');
    await visualEffects().ready;

    expect(boot.atStart).toEqual([{ fwEffects: 'full', fwContrast: 'standard' }]);
    expect(boot.records).toEqual({ 'fw:keyring': { passwordHash: '0xabc' }, myAddresses: ['5Grw'] });
    expect(localStorage.getItem(MIRROR)).toBeNull();
  });

  it('the web wallet: the localStorage choice, with no extension storage involved', async () => {
    localStorage.setItem(MIRROR, JSON.stringify({ value: 'reduced' }));
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-contrast: more)' }));

    await import('@/main');

    expect(boot.atStart).toEqual([{ fwEffects: 'reduced', fwContrast: 'high' }]);
  });
});
