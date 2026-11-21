// src/util/cryptoJsCompat.ts replaces crypto-js in the wallet: it must answer exactly as crypto-js 4.2.0 does (kept
// as a development dependency for this check), for the right passphrase and for wrong ones.
import CryptoJS from 'crypto-js';
import { describe, expect, it } from 'vitest';
import { decryptAesCbcBlocks, decryptCryptoJsPassphraseText, encryptAesCbcText } from '@/util/cryptoJsCompat';

// A seeded generator, so a failure names a reproducible case.
function generator(seed: number) {
  let state = seed >>> 0;

  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;

    return state / 0x1_0000_0000;
  };
}

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz ABCXYZ0123456789-_!@#$%^&*()ÄöüßéçñÅ日本語のパスワード中文Пароль🔐🔑€\u00a0\ufeff\u200d'];

function text(random: () => number, maxLength: number): string {
  const length = Math.floor(random() * (maxLength + 1));
  let value = '';

  for (let index = 0; index < length; index += 1) value += ALPHABET[Math.floor(random() * ALPHABET.length)];

  return value;
}

function cryptoJsDecrypt(cipherText: string, passphrase: string): { ok: string } | { error: true } {
  try {
    return { ok: CryptoJS.AES.decrypt(cipherText, passphrase).toString(CryptoJS.enc.Utf8) };
  } catch {
    return { error: true };
  }
}

function compatDecrypt(cipherText: string, passphrase: string): { ok: string } | { error: true } {
  try {
    return { ok: decryptCryptoJsPassphraseText(cipherText, passphrase) };
  } catch {
    return { error: true };
  }
}

const PHRASE = 'quick brown fox jumps over lazy dog quick brown fox jumps over lazy dog quick brown fox jumps over lazy';

describe('3.0.1-3.0.5 TON phrase text (CryptoJS passphrase AES)', () => {
  it('opens every text crypto-js writes, with the passphrase it was written with', () => {
    const random = generator(0x3_0_5);

    for (let round = 0; round < 300; round += 1) {
      const passphrase = round === 0 ? '' : text(random, 40);
      const plaintext = round === 1 ? '' : round === 2 ? `\ufeff${PHRASE}` : round % 3 ? PHRASE : text(random, 300);
      const cipherText = CryptoJS.AES.encrypt(plaintext, passphrase).toString();

      expect(decryptCryptoJsPassphraseText(cipherText, passphrase), `round ${round}`).toBe(plaintext);
    }
  });

  it('answers a wrong passphrase exactly as crypto-js does: other text, an empty string or an error', () => {
    const random = generator(0x4_2_7);
    const outcomes = new Set<string>();

    for (let round = 0; round < 600; round += 1) {
      const passphrase = text(random, 24) || 'x';
      const cipherText = CryptoJS.AES.encrypt(round % 2 ? PHRASE : text(random, 64), passphrase).toString();
      const wrong = `${passphrase}${text(random, 4) || '!'}`;
      const expected = cryptoJsDecrypt(cipherText, wrong);

      expect(compatDecrypt(cipherText, wrong), `round ${round}`).toEqual(expected);
      outcomes.add('error' in expected ? 'error' : expected.ok === '' ? 'empty' : 'text');
    }
    // The comparison covered both common ways crypto-js answers a wrong passphrase (other text is rare).
    expect(outcomes.has('empty') && outcomes.has('error')).toBe(true);
  });

  it('takes the text without its trailing "=" as crypto-js does, and refuses unsalted or broken text', () => {
    const cipherText = CryptoJS.AES.encrypt(PHRASE, 'Public passphrase').toString();

    expect(decryptCryptoJsPassphraseText(cipherText.replace(/=+$/u, ''), 'Public passphrase')).toBe(PHRASE);
    expect(() => decryptCryptoJsPassphraseText(btoa('not salted at all, sixteen+bytes'), 'Public passphrase')).toThrow();
    expect(() => decryptCryptoJsPassphraseText(`${cipherText.slice(0, -4)}*AAA`, 'Public passphrase')).toThrow();
  });
});

describe('SORA cosigner AES-256-CBC', () => {
  const key = Uint8Array.from({ length: 32 }, (_, index) => index * 7 + 1);
  const iv = Uint8Array.from({ length: 16 }, (_, index) => 255 - index);
  const words = (bytes: Uint8Array) => CryptoJS.enc.Hex.parse(Buffer.from(bytes).toString('hex'));

  it('writes the same ciphertext as crypto-js, and reads what crypto-js wrote', () => {
    const random = generator(0xc051);

    for (let round = 0; round < 200; round += 1) {
      const plaintext = text(random, 500);
      const expected = CryptoJS.AES.encrypt(plaintext, words(key), {
        iv: words(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7,
      }).ciphertext.toString(CryptoJS.enc.Base64);

      expect(encryptAesCbcText(plaintext, key, iv), `round ${round}`).toBe(expected);
      const blocks = decryptAesCbcBlocks(expected, key, iv);
      const padding = blocks[blocks.length - 1];
      expect(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(blocks.subarray(0, -padding))).toBe(plaintext);
    }
  });

  it('refuses ciphertext that is not whole blocks, and a key or IV of the wrong size', () => {
    expect(() => decryptAesCbcBlocks(btoa('fifteen bytes!!'), key, iv)).toThrow();
    expect(() => decryptAesCbcBlocks('', key, iv)).toThrow();
    expect(() => encryptAesCbcText('x', key.subarray(0, 16), iv)).toThrow();
    expect(() => decryptAesCbcBlocks(btoa('sixteen bytes!!!'), key, iv.subarray(0, 8))).toThrow();
  });
});
