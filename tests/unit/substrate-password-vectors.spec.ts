import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { u8aToHex } from '@polkadot/util';
import { cryptoWaitReady, decodeAddress } from '@polkadot/util-crypto';
import { keyring } from '@subwallet/ui-keyring';

vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));

import {
  createSubstratePairFromUri,
  substratePasswordAccounts,
  substratePasswordRecoveryAttempts,
  substratePasswordRules,
  SUBSTRATE_PASSWORD_RULES,
  type SubstratePasswordRule,
} from '@extension-base/services/keyring-service/SubstratePassword';

type Crypto = 'sr25519' | 'ed25519' | 'ecdsa';
type Vector = {
  id: string; mnemonic: string; derivationPath: string; rulesAgree: boolean;
  accounts: Record<SubstratePasswordRule, Record<Crypto, { accountId: string }>>;
};
// Written by scripts/generate-substrate-password-vectors.py (Python standard library only, no client code).
const document = JSON.parse(readFileSync(resolve(__dirname, '../../docs/substrate-password-vectors.json'), 'utf8')) as {
  canonicalRule: string; vectors: Vector[];
};
const CRYPTO: Crypto[] = ['sr25519', 'ed25519', 'ecdsa'];
const accountId = (address: string) => u8aToHex(decodeAddress(address));
// AddWallet.vue suriSubstrate: the words and the Advanced path, both trimmed.
const suri = (vector: Vector) => `${vector.mnemonic}${vector.derivationPath.trim()}`;

beforeAll(async () => {
  await cryptoWaitReady();
  keyring.loadAll({ type: 'sr25519', isDevelopment: false, store: { all: () => {}, get: () => {}, remove: () => {}, set: () => {} } as never,
    password_store: { get: (callback: (value: undefined) => void) => callback(undefined), set: () => {}, remove: () => {} } as never });
});

describe('Substrate path password vectors (docs/substrate-password-vectors.json)', () => {
  it('derives every rule\'s account for every vector and key type', () => {
    expect(document.canonicalRule).toBe('nfkd');
    for (const vector of document.vectors) {
      for (const crypto of CRYPTO) {
        for (const rule of SUBSTRATE_PASSWORD_RULES) {
          const pair = createSubstratePairFromUri(suri(vector), {}, crypto, rule);
          expect(accountId(pair.address), `${vector.id} ${crypto} ${rule}`).toBe(vector.accounts[rule][crypto].accountId);
          expect(pair.haveEntropy, `${vector.id} ${crypto} ${rule}`).toBe(true);
          pair.lock();
        }
      }
    }
  });

  it('defaults to the rule iOS and Android use', () => {
    for (const vector of document.vectors) {
      const pair = createSubstratePairFromUri(suri(vector), {}, 'sr25519');
      expect(accountId(pair.address), vector.id).toBe(vector.accounts.nfkd.sr25519.accountId);
    }
  });

  it('lists one account per distinct rule result, the new rule first', () => {
    const count = (id: string) => substratePasswordAccounts(suri(document.vectors.find((vector) => vector.id === id)!), 'sr25519');
    expect(count('import12-ascii').map(({ rule }) => rule)).toEqual(['nfkd']);
    expect(count('default24-unicode').map(({ rule }) => rule)).toEqual(['nfkd', 'nfc']);
    expect(count('default24-unicode-decomposed-input').map(({ rule }) => rule)).toEqual(['nfkd', 'nfc', 'asTyped']);
    expect(count('import12-katakana').map(({ rule }) => rule)).toEqual(['nfkd', 'nfc']);
  });

  it('offers only the rules that read the password differently, and none for other key types', () => {
    const rules = (id: string, type: 'sr25519' | 'ethereum' = 'sr25519') =>
      substratePasswordRules(suri(document.vectors.find((vector) => vector.id === id)!), type);
    expect(rules('import12-ascii')).toEqual(['nfkd']);
    expect(rules('default24-unicode')).toEqual(['nfkd', 'nfc']);
    expect(rules('default24-unicode-password-only')).toEqual(['nfkd', 'nfc']);
    expect(rules('default24-unicode-decomposed-input')).toEqual(['nfkd', 'nfc', 'asTyped']);
    expect(rules('default24-unicode', 'ethereum')).toEqual(['nfkd']);
    expect(substratePasswordRules(`${document.vectors[0].mnemonic}//polkadot`, 'sr25519')).toEqual(['nfkd']);
    expect(substratePasswordRules(`0x${'1f'.repeat(32)}///pässwörd`, 'sr25519')).toEqual(['nfkd']);
  });

  it('recovery also tries the password decomposed, as web 3.0 kept text pasted that way', () => {
    const composed = document.vectors.find(({ id }) => id === 'default24-unicode')!;
    const decomposed = document.vectors.find(({ id }) => id === 'default24-unicode-decomposed-input')!;
    const attempts = substratePasswordRecoveryAttempts(suri(composed), 'sr25519');

    expect(attempts.map(({ rule }) => rule)).toEqual(['nfkd', 'nfc', 'asTyped']);
    expect(attempts.map(({ suri: text, rule }) => accountId(createSubstratePairFromUri(text, {}, 'sr25519', rule).address))).toEqual([
      composed.accounts.nfkd.sr25519.accountId,
      composed.accounts.nfc.sr25519.accountId,
      decomposed.accounts.asTyped.sr25519.accountId,
    ]);
    // Typed decomposed already, or decomposing gives the NFKD text (kana): no extra attempt.
    expect(substratePasswordRecoveryAttempts(suri(decomposed), 'sr25519')).toHaveLength(3);
    expect(substratePasswordRecoveryAttempts(suri(document.vectors.find(({ id }) => id === 'import12-katakana')!), 'sr25519')
      .map(({ rule }) => rule)).toEqual(['nfkd', 'nfc']);
    expect(substratePasswordRecoveryAttempts(suri(document.vectors.find(({ id }) => id === 'import12-ascii')!), 'sr25519'))
      .toEqual([{ suri: suri(document.vectors.find(({ id }) => id === 'import12-ascii')!), rule: 'nfkd' }]);
    expect(substratePasswordRecoveryAttempts(suri(composed), 'ethereum')).toHaveLength(1);
  });

  it('leaves Ethereum keys, raw seeds and paths without a password to createFromUri', () => {
    const vector = document.vectors.find(({ id }) => id === 'default24-unicode')!;
    const ethereumSuri = `${vector.mnemonic}/m/44'/60'/0'/0/0///pässwörd`;
    expect(createSubstratePairFromUri(ethereumSuri, {}, 'ethereum').address)
      .toBe(keyring.createFromUri(ethereumSuri, {}, 'ethereum').address);
    const rawSeed = `0x${'1f'.repeat(32)}//polkadot`;
    expect(createSubstratePairFromUri(rawSeed, {}, 'sr25519').address).toBe(keyring.createFromUri(rawSeed, {}, 'sr25519').address);
    const noPassword = `${vector.mnemonic}//polkadot`;
    expect(createSubstratePairFromUri(noPassword, {}, 'sr25519').address).toBe(keyring.createFromUri(noPassword, {}, 'sr25519').address);
  });
});
