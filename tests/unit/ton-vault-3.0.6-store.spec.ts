// Ported from 3.0.6's tests/unit/hotfix-3.0.6-ton-store.spec.ts. TonKeyringService.loadAll is what start-up reads:
// a TON record it cannot use must not hide the others, and a record in an unknown format still stays in the wallet.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TonKeyringService } from '@extension-base/services/keyring-service/TonKeyring';
import type { KeyringService } from '@extension-base/services/keyring-service';

const mocks = vi.hoisted(() => ({ stored: {} as Record<string, unknown>, failReads: false }));
vi.mock('@extension-base/stores/WalletStorage', () => ({
  readWalletRecords: async () => {
    await Promise.resolve();
    if (mocks.failReads) throw new Error('Cannot read wallet storage');
    return Object.fromEntries(Object.entries(mocks.stored).map(([address, record]) => [`fw:ton:${address}`, structuredClone(record)]));
  },
}));

const KEY = '0'.repeat(64);
const record = (address: string, publicKeyHex = KEY) => ({ name: address, address, cipherSeed: 'x', publicKeyHex });

function tonKeyring() {
  const keyringService = { getPassword: () => '' } as unknown as KeyringService & { tonKeyring: TonKeyringService };
  const service = new TonKeyringService(keyringService);

  Object.assign(keyringService, { tonKeyring: service });

  return service;
}

afterEach(() => {
  mocks.failReads = false;
  vi.restoreAllMocks();
});

describe('TON records are loaded one by one', () => {
  it('lists the valid records, and the one in an unknown format, and skips one in an unknown layout', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mocks.stored = {
      first: record('first'),
      second: record('second', 'not hex'),
      fourth: null,
      fifth: record('fifth'),
      sixth: { ...record('sixth'), cipherSeed: 'a ciphertext in no format this wallet writes' },
    };
    const before = structuredClone(mocks.stored);
    const service = tonKeyring();

    await service.loadAll();

    expect(service.getAccounts().map(({ address }) => address)).toEqual(['first', 'fifth', 'sixth']);
    expect(mocks.stored).toEqual(before);
    // The skipped records are reported by address only, never with what they hold.
    expect(JSON.stringify(warn.mock.calls)).not.toContain('cipherSeed');
  });

  it('still rejects when storage itself cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.failReads = true;
    const service = tonKeyring();

    await expect(service.loadAll()).rejects.toThrow('Cannot read wallet storage');
  });
});
