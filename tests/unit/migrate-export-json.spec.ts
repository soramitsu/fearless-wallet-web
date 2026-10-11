import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));

import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
// chrome.storage.local as the real Fearless Wallet 2.6.3 build wrote it (see tests/fixtures/upgrade/README.md).
import profile from '../fixtures/upgrade/s1-2.6.3-per-account-passwords.json';
// ECDSA accounts, each with its own password, as the real 2.6.3 build wrote them.
import ecdsaProfile from '../fixtures/upgrade/s3-2.6.3-ecdsa-per-account-passwords.json';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

const [savings, forgotten, staking] = profile.wallets;
const extension = Object.create(FWExtensionBase.prototype) as FWExtensionBase;
const get = vi.fn();

beforeAll(async () => {
  await cryptoWaitReady();
});

beforeEach(() => {
  get.mockReset().mockImplementation(async () => structuredClone(profile.storage));
  vi.stubGlobal('chrome', { storage: { local: { get } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the encrypted backup of an account that still has its old password', () => {
  it('is the stored record as it is, for a Substrate account and for its Ethereum account', async () => {
    const storage = profile.storage as unknown as Record<string, KeyringPair$Json>;

    expect((await extension.migrateExportJSON(forgotten.address)).json).toEqual(
      storage['fw:account:0x625e25364c7b68e0a83065ccb40afed43f8fe933e669b24f3d69a57eddb3b715']
    );
    // 2.6.3 stored an Ethereum account under its address, with its public key in the record.
    expect((await extension.migrateExportJSON(forgotten.ethereumAddress)).json).toEqual(
      storage['fw:account:0x58a57ed9d8d624cbd12e2c467d34787555bb1b25']
    );
    expect((await extension.migrateExportJSON(staking.address)).json.meta.name).toBe('Staking');
    expect(get).toHaveBeenCalledWith(null);
  });

  it('still opens with the password the account had in 2.6.3, and with no other', { timeout: 120_000 }, async () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const { json } = await extension.migrateExportJSON(savings.address);
    const pair = keyring.createFromJson(json);

    expect(pair.address).toBe(savings.address);
    expect(() => pair.decodePkcs8('legacy-pw-B')).toThrow();
    pair.decodePkcs8(savings.password);
    expect(pair.isLocked).toBe(false);
    // The phrase the wallet was created from in 2.6.3 gives the same key.
    expect(keyring.createFromUri(savings.mnemonic).address).toBe(savings.address);

    const child = keyring.createFromJson((await extension.migrateExportJSON(savings.ethereumAddress)).json);
    child.decodePkcs8(savings.password);
    expect(child.address).toBe(savings.ethereumAddress);
  });

  // The popup must get an answer: a promise that never settles would leave Download waiting forever.
  it('rejects for an account without a stored record instead of never answering', async () => {
    await expect(
      extension.migrateExportJSON('5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY')
    ).rejects.toThrow('account_record_not_found');
    await expect(
      extension.migrateExportJSON('0x1111111111111111111111111111111111111111')
    ).rejects.toThrow('account_record_not_found');
  });

  // The record of an ECDSA account holds its public key; the address is the hash of it. 2.6.3 stored the record
  // under that hash, 4.2.0 moves it under the public key at load.
  it('is found for an ECDSA account, under either key, and opens with its own password', { timeout: 120_000 }, async () => {
    const [vault, spare] = ecdsaProfile.wallets;
    const shipped = ecdsaProfile.storage as unknown as Record<string, KeyringPair$Json>;
    const keyring = new Keyring({ type: 'ecdsa' });
    const legacyKey = 'fw:account:0x5450c161417116657e6968dc2c108227d25a0d9be367d84c8591d4687288ad62';

    get.mockImplementation(async () => structuredClone(shipped));
    expect((await extension.migrateExportJSON(vault.address)).json).toEqual(shipped[legacyKey]);
    expect((await extension.migrateExportJSON(spare.address)).json.meta.name).toBe('Spare');

    const { [legacyKey]: record, ...rest } = shipped;
    get.mockImplementation(async () => structuredClone({ ...rest, [`fw:account:${record.address}`]: record }));
    const { json } = await extension.migrateExportJSON(vault.address);
    const pair = keyring.createFromJson(json);
    pair.decodePkcs8(vault.password);
    expect(pair.address).toBe(vault.address);
  });

  it('rejects when storage cannot be read', async () => {
    get.mockRejectedValue(new Error('IO error: LOCK file in use'));

    await expect(extension.migrateExportJSON(savings.address)).rejects.toThrow('LOCK file in use');
  });
});
