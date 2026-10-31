import { keyring } from '@subwallet/ui-keyring';
import { isHex } from '@polkadot/util';
import {
  ed25519PairFromSeed,
  keyExtractSuri,
  keyFromPath,
  mnemonicToEntropy,
  mnemonicToMiniSecret,
  mnemonicValidate,
  secp256k1PairFromSeed,
  sr25519PairFromSeed,
} from '@polkadot/util-crypto';
import type { KeypairType, KeyringPair, KeyringPair$Meta } from '@subwallet/keyring/types';

/**
 * How a client turned the `///password` of a Substrate path into the mini secret's salt
 * (docs/substrate-password-vectors.json):
 * - `nfkd`: NFKD(password), as iOS and Android always have and as BIP39 specifies. New accounts use it.
 * - `nfc`: NFC(password), Fearless web 4.2.x (@polkadot/util-crypto 14 NFC-normalises the whole SURI).
 * - `asTyped`: the password exactly as entered, Fearless web 3.0.x and earlier (@polkadot/util-crypto 12).
 * The rules disagree only for passwords that normalisation changes; ASCII passwords give one account.
 */
export type SubstratePasswordRule = 'nfkd' | 'nfc' | 'asTyped';

export const SUBSTRATE_PASSWORD_RULES: readonly SubstratePasswordRule[] = ['nfkd', 'nfc', 'asTyped'];

const PAIR_FROM_SEED = { sr25519: sr25519PairFromSeed, ed25519: ed25519PairFromSeed, ecdsa: secp256k1PairFromSeed };

type SubstrateKeypairType = keyof typeof PAIR_FROM_SEED;

const isSubstrateKeypairType = (type: KeypairType): type is SubstrateKeypairType => Object.hasOwn(PAIR_FROM_SEED, type);

/** The salt password `rule` gives, or undefined when the SURI is not words with a `///password`. */
export function substrateSaltPassword(suri: string, rule: SubstratePasswordRule): string | undefined {
  const { password, phrase } = keyExtractSuri(suri);
  if (password === undefined || isHex(phrase) || !mnemonicValidate(phrase)) return undefined;
  if (rule === 'nfkd') return password.normalize('NFKD');
  if (rule === 'nfc') return password;
  // util-crypto 12 took everything after the first '///' as it was; words and junctions hold no '/'.
  return suri.slice(suri.indexOf('///') + 3);
}

/** The rules that open different accounts for this SURI and key type, `nfkd` first. */
export function substratePasswordRules(suri: string, type: KeypairType | undefined): SubstratePasswordRule[] {
  if (!isSubstrateKeypairType(type ?? keyring.keyring.type)) return ['nfkd'];
  const salts = new Set<string>();

  return SUBSTRATE_PASSWORD_RULES.filter((rule) => {
    const salt = substrateSaltPassword(suri, rule);
    if (salt === undefined) return rule === 'nfkd';
    if (salts.has(salt)) return false;
    salts.add(salt);

    return true;
  });
}

/**
 * The SURIs and rules to try when words and a path must reproduce a stored key: every rule for the text as
 * typed, then 3.0's for the password decomposed (NFD), as text pasted from some sources arrived there.
 */
export function substratePasswordRecoveryAttempts(
  suri: string,
  type: KeypairType | undefined
): { suri: string; rule: SubstratePasswordRule }[] {
  const attempts = substratePasswordRules(suri, type).map((rule) => ({ suri, rule }));
  const index = suri.indexOf('///');
  if (index < 0 || !isSubstrateKeypairType(type ?? keyring.keyring.type)) return attempts;
  const decomposed = `${suri.slice(0, index)}///${suri.slice(index + 3).normalize('NFD')}`;
  const salt = substrateSaltPassword(decomposed, 'asTyped');
  const known = attempts.map(({ rule }) => substrateSaltPassword(suri, rule));

  return salt === undefined || known.includes(salt) ? attempts : [...attempts, { suri: decomposed, rule: 'asTyped' }];
}

/**
 * keyring.createFromUri for a Substrate key whose path password is read with `rule`. Other key types,
 * raw seeds and paths without a password, where every rule agrees, go to createFromUri unchanged.
 * The pair is built as SubWallet's createFromUri builds it, with the phrase's entropy, so the phrase
 * can still be exported.
 */
export function createSubstratePairFromUri(
  suri: string,
  meta: KeyringPair$Meta,
  type: KeypairType | undefined,
  rule: SubstratePasswordRule = 'nfkd'
): KeyringPair {
  const pairType = type ?? keyring.keyring.type;
  const salt = isSubstrateKeypairType(pairType) ? substrateSaltPassword(suri, rule) : undefined;
  const { password, path, phrase } = keyExtractSuri(suri);
  if (!isSubstrateKeypairType(pairType) || salt === undefined || salt === password) {
    return keyring.createFromUri(suri, meta, type);
  }
  const derived = keyFromPath(PAIR_FROM_SEED[pairType](mnemonicToMiniSecret(phrase, salt)), path, pairType);

  return keyring.keyring.createFromPair(
    { ...derived, entropy: mnemonicToEntropy(phrase) } as Parameters<typeof keyring.keyring.createFromPair>[0],
    { ...meta, isMasterAccount: true, genesisHash: '' },
    pairType
  );
}

/** The account each rule opens for this SURI, one per rule in substratePasswordRules. */
export function substratePasswordAccounts(
  suri: string,
  type: KeypairType | undefined
): { rule: SubstratePasswordRule; address: string }[] {
  return substratePasswordRules(suri, type).map((rule) => {
    const pair = createSubstratePairFromUri(suri, {}, type, rule);
    pair.lock();

    return { rule, address: pair.address };
  });
}
