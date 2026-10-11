import { Keyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyringPair$Json } from '@polkadot/keyring/types';

vi.mock('@/extension/background/extension-base/src/background/handlers/utils', () => ({ isNativeEVMNetwork: () => false }));

import FWExtensionBase from '@extension-base/background/handlers/ExtensionBase';
// chrome.storage.local as the real Fearless Wallet 2.6.3 build wrote it (see tests/fixtures/upgrade/README.md).
import profile from '../fixtures/upgrade/s1-2.6.3-per-account-passwords.json';

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

  it('rejects when storage cannot be read', async () => {
    get.mockRejectedValue(new Error('IO error: LOCK file in use'));

    await expect(extension.migrateExportJSON(savings.address)).rejects.toThrow('LOCK file in use');
  });
});
