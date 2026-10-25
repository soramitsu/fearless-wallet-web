import { keyring } from '@subwallet/ui-keyring';
import { u8aEq, stringToU8a } from '@polkadot/util';
import { accountStorageKey } from './AccountMetadata';
import type { KeyringPair, KeyringPair$Json } from '@subwallet/keyring/types';
import { decodeMnemonicFromJsonBackup } from '@/util/keyringJson';
import { buildUniversalWalletKeyringMeta } from '@/util/universalWalletKeyringMeta';
import { WalletEcosystem } from '@/interfaces';

/** Decode without registering. A JSON header, PKCS8 public key and private signing key
 * must identify the same account before any durable import is attempted. */
export function decodeJsonAccount(file: KeyringPair$Json, password: string): KeyringPair {
  // The old restore path interprets legacy backups without an algorithm as Ed25519.
  const type = Array.isArray(file.encoding.content) ? file.encoding.content[1] : 'ed25519';
  if (!['sr25519', 'ed25519', 'ecdsa', 'ethereum'].includes(type)) {
    throw new Error('Unsupported JSON account key type.');
  }
  // Backup metadata is descriptive input, not authority to claim another wallet or network.
  // Keep it inert for recovery; only the decoded primary key establishes active identity.
  const meta = {
    name: typeof file.meta?.name === 'string' ? file.meta.name : '',
    jsonBackupMeta: file.meta?.jsonBackupMeta ?? file.meta,
  };
  const json: KeyringPair$Json = { ...file, meta, encoding: { ...file.encoding, content: ['pkcs8', type], version: '3' } };
  if (Array.isArray(file.encoding.content) && file.encoding.content[0] !== 'pkcs8') {
    throw new Error('Unsupported JSON account encoding.');
  }
  const pair = keyring.createFromJson(json);
  try {
    const expectedKey = accountStorageKey(pair);
    const expectedPublicKey = pair.publicKey.slice();
    pair.decodePkcs8(password);
    // Ethereum backups may use the 20-byte address; other headers contain the full key.
    const addressOnly = pair.type === 'ethereum' && expectedPublicKey.length === 20;
    if (accountStorageKey(pair) !== expectedKey || (!addressOnly && !u8aEq(pair.publicKey, expectedPublicKey))) {
      throw new Error('Encrypted account key does not match the JSON address.');
    }
    // Also bind PKCS8's embedded public key: the library derives a key from 32-byte
    // secrets and would otherwise silently ignore a mismatched embedded key.
    const phrase = decodeMnemonicFromJsonBackup(json, password, pair.publicKey);
    const proof = stringToU8a('Fearless local JSON account key validation');
    if (!pair.verify(proof, pair.sign(proof), pair.publicKey)) {
      throw new Error('Encrypted account private key does not match its public key.');
    }
    let verifiedMnemonic = !pair.haveEntropy;
    if (pair.haveEntropy) {
      // Old custom-path backups may omit the path/passphrase. Keep their encrypted entropy
      // and primary signing key, but do not advertise that unverified phrase as a root.
      let root: KeyringPair | undefined;
      try {
        root = keyring.createFromUri(phrase, {}, pair.type);
        verifiedMnemonic = u8aEq(root.publicKey, pair.publicKey);
      } catch { verifiedMnemonic = false; } finally { root?.lock(); }
    }
    pair.setMeta({ isMnemonicUnverified: !verifiedMnemonic });
    pair.setMeta({ universalWallet: buildUniversalWalletKeyringMeta({ address: pair.address,
      meta: pair.meta, source: 'legacy-import',
      walletEcosystem: pair.type === 'ethereum' ? WalletEcosystem.Evm : WalletEcosystem.Substrate,
    }) });
    return pair;
  } catch (error) {
    pair.lock();
    throw error;
  }
}
