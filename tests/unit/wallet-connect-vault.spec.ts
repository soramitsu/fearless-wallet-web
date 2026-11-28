import { expect, it, vi } from 'vitest';
import { hashSync } from 'bcryptjs';
import { ProtectedStorage } from '@extension-base/services/wallet-connect-service/protectedStorage';
import { emptyRecord, SDK_KEYCHAIN, SDK_PAIRINGS, SDK_SESSIONS, WALLET_CONNECT_RECORD, WalletConnectStore } from '@extension-base/services/wallet-connect-service/protocol/store';
import { rotateProtocolVault, VAULT_KEY, type Envelope } from '@extension-base/services/wallet-connect-service/protocol/vault';
import type { TransformStoredRecords } from '@extension-base/stores/StoreMutation';

vi.mock('@/consts/global', async original => ({ ...await original<object>(), IS_EXTENSION: true }));

function fixture() {
  const password = crypto.randomUUID();
  const accounts: Record<string, unknown> = { keyring: { passwordHash: hashSync(password, 4) } };
  const old: Record<string, unknown> = {};
  const read = vi.fn(async (key: string) => structuredClone(accounts[key]));
  const remove = vi.fn(async (key: string) => { delete old[key]; });
  const open = (typed: string) => new ProtectedStorage(() => typed, {
    getItem: async <T>(key: string) => structuredClone(old[key]) as T,
    removeItem: remove,
  }, { getAndWait: read, mutateRecordsAndWait: async (_keys, transform: TransformStoredRecords) => {
    Object.assign(accounts, structuredClone(transform(accounts).entries));
  } });
  return { password, accounts, old, open, remove, read };
}

it('verifies a v1 upgrade before cleanup and resumes after a failed readback or deletion', async () => {
  const { password, accounts, old, open, remove, read } = fixture();
  const record = emptyRecord();
  old[WALLET_CONNECT_RECORD] = record;
  old[SDK_KEYCHAIN] = { client_ed25519_seed: record.clientSeed };
  read.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Interrupted readback'));
  await expect(new WalletConnectStore(open(password)).load()).rejects.toThrow('Interrupted readback');
  expect(remove).not.toHaveBeenCalled();
  expect(JSON.stringify(accounts)).not.toContain(record.clientSeed);
  remove.mockImplementationOnce(async key => { delete old[key]; }).mockRejectedValueOnce(new Error('Interrupted cleanup'));
  await expect(new WalletConnectStore(open(password)).load()).rejects.toThrow('Interrupted cleanup');
  await expect(new WalletConnectStore(open(crypto.randomUUID())).load()).rejects.toThrow();
  expect(old[WALLET_CONNECT_RECORD]).toBeUndefined();
  expect(old[SDK_KEYCHAIN]).toEqual({ client_ed25519_seed: record.clientSeed });
  await expect(new WalletConnectStore(open(password)).load()).resolves.toEqual(record);
  expect(old).toEqual({});
});

it('restores SDK sessions, pairings and identity across lock, unlock and password rotation', async () => {
  const { password, accounts, old, open } = fixture();
  const seed = emptyRecord().clientSeed, topic = emptyRecord().clientSeed, symKey = emptyRecord().clientSeed;
  const participant = { publicKey: seed, metadata: { url: 'https://fixture.invalid' } };
  const session = { topic, acknowledged: true, controller: seed, self: participant, peer: participant, namespaces: {}, expiry: 2e9 };
  const pairing = { topic, active: true, expiry: 2e9, relay: { protocol: 'irn' } };
  Object.assign(old, { [SDK_KEYCHAIN]: { client_ed25519_seed: seed, [topic]: symKey }, [SDK_SESSIONS]: [session], [SDK_PAIRINGS]: [pairing] });
  await expect(new WalletConnectStore(open('')).load()).rejects.toThrow();
  await expect(new WalletConnectStore(open(crypto.randomUUID())).load()).rejects.toThrow();
  expect(accounts[VAULT_KEY]).toBeUndefined();
  const storage = open(password), store = new WalletConnectStore(storage);
  const restored = await store.load();
  expect(restored).toMatchObject({ clientSeed: seed, keys: { [topic]: symKey }, sessions: [session], pairings: [pairing] });
  await store.save(restored);
  storage.close();
  await expect(store.save(restored)).rejects.toThrow();
  await expect(store.load()).rejects.toThrow();
  await expect(new WalletConnectStore(open(password)).load()).resolves.toEqual(restored);
  expect(old).toEqual({});
  expect(JSON.stringify(accounts)).not.toContain(symKey);
  const next = crypto.randomUUID();
  accounts[VAULT_KEY] = rotateProtocolVault(accounts[VAULT_KEY] as Envelope, password, next);
  await expect(new WalletConnectStore(open(password)).load()).rejects.toThrow();
  await expect(new WalletConnectStore(open(next)).load()).resolves.toEqual(restored);
});
