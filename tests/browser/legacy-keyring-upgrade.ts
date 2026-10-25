import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Keyring } from '@subwallet/keyring';
import { keyring } from '@subwallet/ui-keyring';
import { KeyringService } from '@extension-base/services/keyring-service';
import AccountsStore from '@extension-base/stores/Accounts';
import BaseWebStore from '@extension-base/stores/BaseWeb';
import { accountStorageKey } from '@extension-base/services/keyring-service/AccountMetadata';
import { deriveUniversalWalletKeyringFields } from '@/util/universalWalletKeyringFields';
import { WalletEcosystem } from '@/interfaces';

// Public synthetic fixture only. This page is bundled separately from the app,
// served on localhost, and never opens an existing application/extension store.
const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const oldPassword = 'legacy-fixture-password';
const newPassword = 'new-master-fixture-password';
const payload = new TextEncoder().encode('legacy encryption upgrade signing regression');
const storageKey = `fearless-legacy-upgrade-smoke:${new URL(location.href).searchParams.get('run') ?? 'fixture'}`;
type StoredFixture = {
  originals: { address: string; storageKey: string; publicKey: number[]; signature: number[]; encoded: string }[];
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function run() {
  await cryptoWaitReady();
  const saved = localStorage.getItem(storageKey);
  if (!saved) {
    const backend = new Keyring({ type: 'sr25519' });
    const evm = backend.addFromSeed(new Uint8Array(32).fill(7), {}, 'ethereum');
    const parent = backend.addFromUri(mnemonic, { ethereumAddress: evm.address });
    const originals = [parent, evm].map((account) => ({
      address: account.address,
      storageKey: accountStorageKey(account),
      publicKey: Array.from(account.publicKey),
      signature: Array.from(account.sign(payload)),
      json: account.toJson(oldPassword),
    }));
    const store = new AccountsStore();
    for (const original of originals) await store.setAndWait(original.storageKey, original.json);
    originals.forEach(({ json }) => backend.addFromJson(json).lock());
    backend.changeMasterPassword(newPassword);
    let failParentWrite = true;
    let failOptionalWrite = false;
    // Run the production migration orchestration against real cryptographic
    // pairs, with persistence isolated to this synthetic test's own records.
    keyring.getPair = (address) => backend.getPair(address);
    keyring.createFromJson = (json) => backend.createFromJson(json);
    Object.defineProperty(keyring, 'keyring', { configurable: true, get: () => backend });
    const durableUpdate = AccountsStore.prototype.updateAndWait;
    AccountsStore.prototype.updateAndWait = function (key, transform, publish, trackFailure = true) {
      if (key === originals[0].storageKey && failParentWrite) {
        failParentWrite = false;
        return Promise.reject(new Error('Injected synthetic account storage failure'));
      }
      if (!trackFailure && failOptionalWrite) return Promise.reject(new Error('Optional network storage failure'));
      return durableUpdate.call(this, key, transform, publish, trackFailure);
    };
    const service = Object.create(KeyringService.prototype) as KeyringService;
    assert(!(await service.keyringMigrateMasterPassword({ address: parent.address, password: oldPassword })), 'Storage failure was ignored');
    assert(!backend.getPair(parent.address).meta.isMasterPassword, 'Uncommitted parent marked complete');
    backend.getPair(parent.address).decodePkcs8(oldPassword);
    assert(backend.getPair(parent.address).verify(payload, backend.getPair(parent.address).sign(payload), parent.publicKey), 'Failed write changed the old signing key');
    assert(await service.keyringMigrateMasterPassword({ address: parent.address, password: oldPassword }), 'Migration failed');
    assert(backend.getPairs().length === 2, 'Both original accounts must be retained');
    // The ordinary unlock path must complete even if every optional field write
    // fails. Retry performs real derivation and real IndexedDB commits.
    failOptionalWrite = true;
    assert(service.unlockKeyring({ password: newPassword }), 'Optional enrollment blocked unlock');
    await service.waitForLegacyNetworkEnrollment();
    assert(!backend.getPair(parent.address).meta.bitcoinAddress, 'Failed optional write was published');
    failOptionalWrite = false;
    assert(service.unlockKeyring({ password: newPassword }), 'Retry unlock failed');
    await service.waitForLegacyNetworkEnrollment();
    const expected = deriveUniversalWalletKeyringFields(mnemonic);
    const enrolled = await store.getAndWait(originals[0].storageKey);
    assert(enrolled, 'Original account disappeared during enrollment');
    for (const [key, value] of Object.entries(expected)) {
      assert(enrolled.meta[key] === value, `Missing or incorrect derived field ${key}`);
    }
    const raw = await store.getAndWait(originals[1].storageKey);
    assert(!raw?.meta.bitcoinAddress && !raw?.meta.tonAddress, 'A raw key invented a mnemonic root');
    await service.saveAccountMeta(parent.address, { name: 'Renamed after enrollment' });
    await BaseWebStore.flush();
    const fixture: StoredFixture = {
      originals: originals.map(({ json, ...identity }) => ({ ...identity, encoded: json.encoded })),
    };
    localStorage.setItem(storageKey, JSON.stringify(fixture));
    location.reload();
    return;
  }

  const fixture = JSON.parse(saved) as StoredFixture;
  const reopened = new Keyring({ type: 'sr25519' });
  keyring.getPair = (address) => reopened.getPair(address);
  const service = Object.create(KeyringService.prototype) as KeyringService;
  for (const original of fixture.originals) {
    const json = await new AccountsStore().getAndWait(original.storageKey);
    assert(json, 'Missing migrated account after reload');
    assert(json.encoded !== original.encoded, 'Encrypted record was not upgraded');
    const account = reopened.addFromJson(json);
    account.decodePkcs8(newPassword);
    assert(account.address === original.address, 'Legacy address changed');
    assert(Array.from(account.publicKey).join() === original.publicKey.join(), 'Legacy public key changed');
    assert(account.verify(payload, new Uint8Array(original.signature), account.publicKey), 'Old signature no longer verifies');
    assert(account.verify(payload, account.sign(payload), account.publicKey), 'Restored private key cannot sign');
    // Exercise the application's export path, including its JSON fallback for
    // valid all-zero entropy (which the upstream pair export treats as empty).
    if (account.type === 'sr25519') {
      const exported = service.exportMnemonic({
        address: account.address, password: newPassword, walletEcosystem: WalletEcosystem.Substrate,
      });
      assert(exported.seed === mnemonic, 'Mnemonic export changed');
      const expected = deriveUniversalWalletKeyringFields(exported.seed);
      for (const [key, value] of Object.entries(expected)) assert(json.meta[key] === value, `Derived account lost after reload: ${key}`);
      assert(json.meta.name === 'Renamed after enrollment', 'Concurrent metadata rename was lost');
      assert(json.meta.ethereumAddress === fixture.originals[1].address, 'Independent EVM identity changed');
    }
  }
  assert(reopened.getPairs().length === 2, 'Lost an account after reload');
  document.querySelector('#result')!.textContent = JSON.stringify({
    status: 'passed', browserReload: true, indexedDB: true, optionalEnrollmentRetry: true, newNetworkFields: 7, rawKeyNotEnrolled: true, metadataRenamePreserved: true, storageFailureRetry: true, originalAccounts: 2, restoredAccounts: 2,
    legacyAddressesPreserved: true, legacyKeysSign: true, oldSignaturesVerify: true, mnemonicExportPreserved: true,
  }, null, 2);
}

void run().catch((error: Error) => {
  document.querySelector('#result')!.textContent = JSON.stringify({ status: 'failed', error: error.message });
});
