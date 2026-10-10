import { describe, expect, it, vi } from 'vitest';

type StoredRecords = Record<string, unknown>;
type AccountJson = { address: string; meta: object };

const storage = vi.hoisted(() => ({
  fail: false,
  records: {} as Record<string, unknown>,
  writes: 0,
}));

vi.mock('@extension-base/utils/crossenv', () => {
  const chrome = {
    runtime: { lastError: undefined as undefined | { message: string } },
    storage: {
      local: {
        get: (keys: string[] | null, done: (result?: StoredRecords) => void) =>
          setImmediate(() => {
            if (storage.fail) {
              chrome.runtime.lastError = { message: 'IO error: LOCK file in use' };
              done(undefined);
              chrome.runtime.lastError = undefined;

              return;
            }

            done(
              keys
                ? Object.fromEntries(
                    keys.filter((key) => key in storage.records).map((key) => [key, storage.records[key]])
                  )
                : { ...storage.records }
            );
          }),
        remove: () => {
          storage.writes += 1;
        },
        set: () => {
          storage.writes += 1;
        },
      },
    },
  };

  return { chrome };
});
// The full ui-keyring needs wasm the unit environment cannot load. This stand-in keeps the
// part that matters: like Keyring.loadAll in @subwallet/ui-keyring 0.1.14 it reads the
// store and then initialises the keyring options, which assert they run only once
// ('Unable to initialise options more than once', options/index.js).
vi.mock('@subwallet/ui-keyring', () => {
  const accounts = new Map<string, AccountJson>();
  let optionsInitialised = false;

  return {
    keyring: {
      loadAll(options: { store: { all: (update: (key: string, json: AccountJson) => void) => void } }) {
        accounts.clear();
        options.store.all((key, json) => {
          if (key.startsWith('account:')) accounts.set(key, json);
        });
        if (optionsInitialised) throw new Error('Unable to initialise options more than once');
        optionsInitialised = true;
      },
      getAccounts: () => [...accounts.values()],
      getAddresses: () => [],
    },
  };
});
vi.mock('@subwallet/ui-keyring/observable/accounts', () => ({ accounts: { subject: { value: {} } } }));
vi.mock('@subwallet/ui-keyring/observable/addresses', () => ({ addresses: { subject: { value: {} } } }));
vi.mock('@sora-substrate/sdk', () => ({ api: {} }));

describe('KeyringService.loadAll after a failed account read', () => {
  it('reads the stored accounts again instead of initialising ui-keyring a second time', async () => {
    const { EventService } = await import('@extension-base/services/event-service');
    const { KeyringService } = await import('@extension-base/services/keyring-service');
    const service = new KeyringService(new EventService());
    const stored = { address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', meta: { name: 'Stored' } };

    storage.records = { 'fw:account:0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d': stored };
    storage.fail = true;
    await expect(service.loadAll()).rejects.toThrow('IO error: LOCK file in use');

    storage.fail = false;
    await expect(service.loadAll()).resolves.toBeUndefined();

    expect(service.getAccounts()).toEqual([stored]);
    expect(storage.writes).toBe(0);
  });
});
