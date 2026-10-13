import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A TON wallet a real 3.0.5 build wrote (tests/fixtures/upgrade/README.md), deleted and restored across service
// worker restarts. Each "worker" is a fresh module graph over the same chrome.storage.local; the stores, the TON
// keyring and the keyring service are the real ones. This wallet has no keyring pair, so ui-keyring is a stand-in.
const hoisted = vi.hoisted(() => ({ storage: new Map<string, unknown>(), loadAccount: (() => {}) as (...args: unknown[]) => void }));

vi.mock('@extension-base/utils/crossenv', () => {
  const later = (run: () => void) => setTimeout(run);
  const chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (keys: string[] | null, done: (result: Record<string, unknown>) => void) =>
          later(() =>
            done(Object.fromEntries([...hoisted.storage].filter(([key]) => !keys || keys.includes(key)).map(([key, value]) => [key, structuredClone(value)])))
          ),
        set: (items: Record<string, unknown>, done?: () => void) =>
          later(() => {
            Object.entries(items).forEach(([key, value]) => hoisted.storage.set(key, structuredClone(value)));
            done?.();
          }),
        remove: (keys: string | string[], done?: () => void) =>
          later(() => {
            [keys].flat().forEach((key) => hoisted.storage.delete(key));
            done?.();
          }),
      },
    },
  };

  return { chrome };
});
vi.mock('@subwallet/ui-keyring', () => ({
  keyring: {
    keyring: { hasMasterPassword: true, isLocked: true },
    getAccounts: () => [],
    getAddresses: () => [],
    getPair: () => {
      throw new Error('Missing pair');
    },
    loadAccount: (...args: unknown[]) => hoisted.loadAccount(...args),
  },
}));
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@extension-base/services/keyring-service/LegacyNetworkEnrollment', () => ({ enrollLegacyAccountNetworks: vi.fn() }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

type Fixture = { provenance: { masterPassword: string }; storage: Record<string, unknown> };

const MASTER_305 = JSON.parse(
  readFileSync(resolve(__dirname, '../fixtures/upgrade/chrome-3.0.5-master-password.storage.json'), 'utf8')
) as Fixture;
const TON_BIP39 = 'UQC-UdqQ66NWBZO-TGQ3YBfis8kz37HNFju2aKWBNESTSb44';
const TON_NATIVE = 'UQCG65A1CoCyKH3Xet8GNkEcfyGiZolh2DG2zc8rXRVHSPJ0';
const SHIPPED = MASTER_305.storage[`fw:ton:${TON_BIP39}`];
// tonweb checks a 3.0.5 phrase with 100 000 PBKDF2 rounds.
const PBKDF2_SUITE = { timeout: 120_000 };

/** A new service worker: fresh modules, the same chrome.storage.local. */
async function startWorker() {
  vi.resetModules();
  const { KeyringService } = await import('@extension-base/services/keyring-service');
  const { tonStore } = await import('@extension-base/stores/TonStore');
  const { default: BaseExtensionStore } = await import('@extension-base/stores/BaseExtension');
  const service = new KeyringService({ waitCryptoReady: Promise.resolve(true) } as never);

  await tonStore.loaded;

  return { service, settle: () => BaseExtensionStore.flush() };
}

const stored = () => Object.fromEntries(hoisted.storage);
const deletedEntries = () => Object.entries(stored()).filter(([key]) => key.startsWith('fw:deletedWallet:'));

describe('a TON wallet from 3.0.5, deleted and restored', () => {
  beforeEach(() => {
    hoisted.storage.clear();
    Object.entries(MASTER_305.storage).forEach(([key, value]) => hoisted.storage.set(key, structuredClone(value)));
    hoisted.loadAccount = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps the phrase as 3.0.5 stored it, and puts it back so it opens with the master password', PBKDF2_SUITE, async () => {
    const first = await startWorker();
    expect(Object.keys(first.service.tonKeyring.accountSubject.value).sort()).toEqual([TON_BIP39, TON_NATIVE].sort());

    // Extension.accountsForget: the keys are kept first, then the wallet is removed.
    await first.service.forgetAccount(TON_BIP39);
    await first.settle();

    expect(stored()[`fw:ton:${TON_BIP39}`]).toBeUndefined();
    const [[, entry]] = deletedEntries() as [string, { address: string; name: string; walletEcosystem: string; ton: unknown; accounts: object }][];
    expect(entry).toMatchObject({ address: TON_BIP39, name: 'TON from BIP39', walletEcosystem: 'ton', accounts: {} });
    expect(entry.ton).toEqual(SHIPPED);
    // The other TON wallet is untouched.
    expect(stored()[`fw:ton:${TON_NATIVE}`]).toEqual(MASTER_305.storage[`fw:ton:${TON_NATIVE}`]);

    // Not loaded at the next start, and listed in Account access.
    const second = await startWorker();
    expect(Object.keys(second.service.tonKeyring.accountSubject.value)).toEqual([TON_NATIVE]);
    const [deleted] = await second.service.getDeletedWallets();
    expect(deleted).toMatchObject({ address: TON_BIP39, name: 'TON from BIP39', walletEcosystem: 'ton' });

    expect(await second.service.restoreDeletedWallet(deleted.id)).toEqual({
      ok: true,
      address: TON_BIP39,
      name: 'TON from BIP39',
      walletEcosystem: 'ton',
    });
    await second.settle();
    expect(Object.keys(second.service.tonKeyring.accountSubject.value).sort()).toEqual([TON_BIP39, TON_NATIVE].sort());
    expect(stored()[`fw:ton:${TON_BIP39}`]).toEqual(SHIPPED);
    expect(deletedEntries()).toEqual([]);
    expect(hoisted.loadAccount).not.toHaveBeenCalled();

    // At the next start it is a wallet as before: the stored phrase opens with the 3.0.5 master password and
    // derives the stored public key.
    const third = await startWorker();
    expect(Object.keys(third.service.tonKeyring.accountSubject.value).sort()).toEqual([TON_BIP39, TON_NATIVE].sort());
    const phrase = await third.service.tonKeyring.vault.decryptVerified(TON_BIP39, () => MASTER_305.provenance.masterPassword);
    expect(phrase.split(' ').length).toBeGreaterThanOrEqual(12);
  });

  it('never writes over a wallet that was imported again, and keeps the copy', PBKDF2_SUITE, async () => {
    const first = await startWorker();
    await first.service.forgetAccount(TON_BIP39);
    await first.settle();
    const [[entryKey]] = deletedEntries();

    // Imported again (here: the same record written back), the wallet is in the list and not offered for restore.
    hoisted.storage.set(`fw:ton:${TON_BIP39}`, { ...structuredClone(SHIPPED as object), name: 'Imported again' });
    const second = await startWorker();
    expect(await second.service.getDeletedWallets()).toEqual([]);
    expect(await second.service.restoreDeletedWallet(entryKey.slice('fw:deletedWallet:'.length))).toEqual({
      ok: false,
      code: 'already_in_wallet',
    });
    await second.settle();
    expect(stored()[`fw:ton:${TON_BIP39}`]).toMatchObject({ name: 'Imported again' });
    expect(deletedEntries().map(([key]) => key)).toEqual([entryKey]);
  });
});
