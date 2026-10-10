/**
 * @jest-environment node
 */
// TonKeyring.ts is the one key-handling file the hotfix edits (two unused helpers removed). These tests load
// records that 3.0.5 itself wrote (tests/fixtures/3.0.5) and check that 3.0.6 reads them unchanged.
import { TonKeyringService } from '../../src/extension/background/extension-base/src/services/keyring-service/TonKeyring';
import { tonStore } from '../../src/extension/background/extension-base/src/stores/TonStore';
import fixture from '../fixtures/3.0.5/ton-accounts.json';

jest.mock('../../src/extension/background/extension-base/src/stores/TonStore', () => ({
  tonStore: { all: jest.fn(), set: jest.fn(), remove: jest.fn() },
}));

type StoredAccount = (typeof fixture.accounts)[number]['stored'];

function startWithStoredAccounts(password: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const keyringService: any = { getPassword: () => password };
  const tonKeyring = new TonKeyringService(keyringService);

  keyringService.tonKeyring = tonKeyring;

  // The constructor hands the store a callback; the real store calls it once per stored record after
  // chrome.storage has answered, which is what happens every time the service worker starts.
  const [update] = (tonStore.all as jest.Mock).mock.calls[0] as [(key: string, value: StoredAccount) => void];

  fixture.accounts.forEach(({ stored }) => update(stored.address, stored));

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

  it.each(fixture.accounts)('lists the $kind account with the same address and public key', ({ stored }) => {
    const tonKeyring = startWithStoredAccounts(fixture.password);
    const account = tonKeyring.accountSubject.value[stored.address];

    expect(tonKeyring.getAccounts().map(({ address }) => address)).toContain(stored.address);
    expect(Buffer.from(account.publicKey).toString('hex')).toBe(stored.publicKeyHex);
    expect(tonKeyring.getUserFriendlyAddress(account.walletContract.address)).toBe(stored.address);
    expect(account.cipherSeed).toBe(stored.cipherSeed);
  });

  it.each(fixture.accounts)(
    'decrypts the $kind phrase and derives the same signing key',
    async ({ phrase, stored }) => {
      const tonKeyring = startWithStoredAccounts(fixture.password);
      const decrypted = tonKeyring.decodeMnemonic(stored.cipherSeed);

      expect(decrypted).toBe(phrase);

      const { publicKey } = await tonKeyring.mnemonicToKeyPair(decrypted.split(' '));

      expect(Buffer.from(publicKey).toString('hex')).toBe(stored.publicKeyHex);
    }
  );

  it('does not write, rewrite or remove any stored record while loading and reading', () => {
    const tonKeyring = startWithStoredAccounts(fixture.password);

    fixture.accounts.forEach(({ stored }) => tonKeyring.decodeMnemonic(stored.cipherSeed));

    expect(tonStore.set).not.toHaveBeenCalled();
    expect(tonStore.remove).not.toHaveBeenCalled();
  });

  it('does not return a phrase for a wrong password', () => {
    const tonKeyring = startWithStoredAccounts('not the password');

    fixture.accounts.forEach(({ phrase, stored }) => {
      let decrypted = '';

      try {
        decrypted = tonKeyring.decodeMnemonic(stored.cipherSeed);
      } catch {
        // CryptoJS throws on bytes that are not UTF-8; no phrase either way.
      }

      expect(decrypted).not.toBe(phrase);
    });
  });
});
