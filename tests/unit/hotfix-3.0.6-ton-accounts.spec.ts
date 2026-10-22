/**
 * @jest-environment node
 */
// Public fixtures written by 3.0.5 must remain readable before the unlock migration.
import { TonKeyringService } from '../../src/extension/background/extension-base/src/services/keyring-service/TonKeyring';
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';

jest.mock('../../src/extension/background/extension-base/src/stores/TonStore', () => ({
  tonStore: { readAll: jest.fn(), saveMany: jest.fn(), removeAccount: jest.fn() },
}));

async function startWithStoredAccounts(password: string) {
  (tonStore.readAll as jest.Mock).mockResolvedValue(fixture.accounts.map(({ stored }) => stored));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyringService: any = { getPassword: () => password };
  const tonKeyring = new TonKeyringService(keyringService);

  keyringService.tonKeyring = tonKeyring;
  await tonKeyring.withStoreLock(async () => undefined);

  return tonKeyring;
}

describe('3.0.6 reads TON accounts written by 3.0.5', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses a fixture written by the published source', () => {
    expect(fixture.source.commit).toBe('129807f0deff4b1cd028b4152084b66d5de77f58');
    expect(fixture.accounts.map(({ kind }) => kind)).toEqual(['ton-native-24', 'bip39-12']);
  });

  it.each(fixture.accounts)('lists the $kind account with the same address and public key', async ({ stored }) => {
    const tonKeyring = await startWithStoredAccounts(fixture.password);
    const account = tonKeyring.accountSubject.value[stored.address];

    expect(tonKeyring.getAccounts().map(({ address }) => address)).toContain(stored.address);
    expect(Buffer.from(account.publicKey).toString('hex')).toBe(stored.publicKeyHex);
    expect(tonKeyring.getUserFriendlyAddress(account.walletContract.address)).toBe(stored.address);
    expect(account.cipherSeed).toBe(stored.cipherSeed);
  });

  it.each(fixture.accounts)(
    'decrypts the $kind phrase and derives the same signing key',
    async ({ phrase, stored }) => {
      const tonKeyring = await startWithStoredAccounts(fixture.password);
      const decrypted = tonKeyring.decodeMnemonic(stored.cipherSeed);

      expect(decrypted === phrase).toBe(true);

      const { publicKey } = await tonKeyring.mnemonicToKeyPair(decrypted.split(' '));

      expect(Buffer.from(publicKey).toString('hex')).toBe(stored.publicKeyHex);
    }
  );

  it('does not write, rewrite or remove any stored record while loading and reading', async () => {
    const tonKeyring = await startWithStoredAccounts(fixture.password);

    fixture.accounts.forEach(({ stored }) => tonKeyring.decodeMnemonic(stored.cipherSeed));

    expect(tonStore.saveMany).not.toHaveBeenCalled();
    expect(tonStore.removeAccount).not.toHaveBeenCalled();
  });

  it('does not return a phrase for a wrong password', async () => {
    const tonKeyring = await startWithStoredAccounts('not the password');

    fixture.accounts.forEach(({ phrase, stored }) => {
      let decrypted = '';

      try {
        decrypted = tonKeyring.decodeMnemonic(stored.cipherSeed);
      } catch {
        // CryptoJS throws on bytes that are not UTF-8; no phrase either way.
      }

      expect(decrypted === phrase).toBe(false);
    });
  });
});
