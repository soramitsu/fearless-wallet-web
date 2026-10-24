// Public test secrets for the upgrade E2E. Every phrase is a published BIP39 test vector or a phrase derived here from
// a fixed seed, every raw key is a well-known development key (Substrate //Alice, Hardhat account #0). None of them
// may ever hold funds.
export const EVM_PATH = "/m/44'/60'/0'/0/0";

export const PHRASES = {
  // BIP39 test vectors (entropy 7f…7f, 80…80, and the 24-word 7f…7f).
  legalWinner12: 'legal winner thank year wave sausage worth useful legal winner thank yellow',
  letterAdvice12: 'letter advice cage absurd amount doctor acoustic avoid letter advice cage above',
  legalWinner24:
    'legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth useful legal winner thank year wave sausage worth title',
  // Trezor BIP39 vector (entropy 9e885d952ad362caeb4efe34a8e91bd2).
  schemeSpot12: 'scheme spot photo card baby mountain device kick cradle pact join borrow',
  // All-zero entropy. 3.0.x keeps no phrase for it, so tests never expect it back from an export.
  abandon12: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  // A native TON phrase (tonweb-mnemonic's checksum, not BIP39), found from a fixed xorshift seed ("FEAR").
  // Public key 6d645f085c1d03347b5bcba0dcbc4b3a4def9a2cfb42ba3c98253cf2e9af5491.
  nativeTon24:
    'motor robot hidden process lady summer apart iron educate pool call spy mad dog awful twice wrong pair sign vacuum convince web trade develop',
};

export const RAW = {
  // Substrate //Alice mini secret: 5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY.
  sr25519Seed: '0xe5be9a5092b81bca64be81d212e7f2f9eba183bb7a90954f7b76361f6edb5c0a',
  // Hardhat account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266.
  evmPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
};

// A non-ASCII master password exercises bcrypt, scrypt and CryptoJS UTF-8 handling (web-keys.md E16).
export const PASSWORDS = {
  master: 'Pässwörd-日本語-🔐',
  changedIn305: 'Changed in 3.0.5 · Ünïcödé',
  afterReset: 'Set after Reset wallet in 3.0.5',
  changedInHead: 'Changed in 4.2.0 · 新しい',
  wrong: 'not-the-password',
  pwA: 'legacy-pw-A',
  pwB: 'Bravo-pässwort-🔑',
  pwC1: 'legacy-pw-C-substrate',
  pwC2: 'legacy-pw-C-ethereum',
  pwD: 'legacy-pw-D',
  pwE: 'legacy-pw-E',
};
