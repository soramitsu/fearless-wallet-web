import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@polkadot/keyring';
import CryptoJS from 'crypto-js';

const fixture = vi.hoisted(() => ({ records: {} as Record<string, { cipherSeed: string; pendingCipherSeed?: string; [key: string]: unknown }>, updates: vi.fn() }));
vi.mock('@/consts/global', async original => ({ ...(await original<Record<string, unknown>>()), IS_EXTENSION: false }));
vi.mock('@extension-base/stores/KeyringStoreWeb', () => ({ default: class { static readOnly = true; } }));
vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));
vi.mock('@extension-base/stores/TonStore', () => ({ tonStore: {
  getAndWait: async (address: string) => structuredClone(fixture.records[address]),
  updateAndWait: fixture.updates,
} }));

import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { TonSeedVault } from '@extension-base/services/keyring-service/TonSeedVault';
import profile from '../fixtures/upgrade/s1-2.6.3-per-account-passwords.json';
import ecdsaProfile from '../fixtures/upgrade/s3-2.6.3-ecdsa-per-account-passwords.json';
import vectors from '../../docs/universal-wallet-v2-vectors.json';

beforeAll(async () => { await cryptoWaitReady(); });
beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  fixture.records = {};
  fixture.updates.mockReset().mockImplementation(async (address, transform, publish) => {
    const next = transform(structuredClone(fixture.records[address]));
    if (next !== undefined) { fixture.records[address] = next; publish?.(next); }
    return next;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function stored(source: Record<string, unknown>) {
  vi.spyOn(BaseWebStore.prototype, 'getAllItemsWithKeys').mockResolvedValue(
    Object.entries(source).map(([key, value]) => ({ key, value })));
  return vi.spyOn(BaseWebStore.prototype, 'replaceAndWait').mockResolvedValue(undefined);
}

describe('web emergency recovery preserves encrypted records', () => {
  it.each([{ label: 'sr25519', source: profile }, { label: 'ecdsa', source: ecdsaProfile }])('exports historical $label encrypted records without chrome storage', async ({ source }) => {
    const write = stored(source.storage);
    const extension = Object.create(FWExtensionBase.prototype) as FWExtensionBase;
    const account = source.wallets[0];
    const result = await extension.migrateExportJSON(account.address);
    expect(Object.values(source.storage)).toContainEqual(result.json);
    const pair = new Keyring().createFromJson(result.json);
    pair.decodePkcs8(account.password);
    expect(pair.address).toBe(account.address);
    expect(write).not.toHaveBeenCalled();
  });

  it('loads canonical ECDSA identities without writing reconciliation during recovery-only access', async () => {
    const write = stored(ecdsaProfile.storage);
    const load = vi.fn();
    await new AccountsStore().all(load);
    expect(load).toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it.each(['current', 'pending'])('exports verified TON %s ciphertext without promoting or deleting either copy', async which => {
    const vector = vectors.vectors[0];
    const address = 'public-ton-fixture';
    const password = 'Public TON recovery password';
    const other = 'Public other password';
    const record = { address, name: 'Public TON', publicKeyHex: vector.expected.ton.publicKeyHex,
      cipherSeed: CryptoJS.AES.encrypt(vector.mnemonic, which === 'current' ? password : other).toString(),
      pendingCipherSeed: CryptoJS.AES.encrypt(vector.mnemonic, which === 'pending' ? password : other).toString() };
    fixture.records[address] = structuredClone(record);
    const publish = vi.fn();
    const vault = new TonSeedVault({ accountSubject: { value: { [address]: {
      ...record, publicKey: Uint8Array.from(Buffer.from(record.publicKeyHex, 'hex')),
    } } }, setAccounts: publish });
    expect(await vault.decryptVerified(address, () => password)).toBe(vector.mnemonic);
    expect(fixture.records[address]).toEqual(record);
    expect(fixture.updates).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });
});
