// The scrypt cost of every key the wallet encrypts: new and imported accounts, master password changes, legacy
// password upgrades, recovery and JSON export all end in a keyring pair encoder, and a batch export in jsonEncrypt.
// Those call scryptEncode with @polkadot/util-crypto's default cost. 14.x raised that default to N = 2^17; the 12.x
// libraries of Fearless 2.x and 3.0.x open a key only at exactly N = 2^15, p = 1, r = 8, and 14.x still reads both.
// Writing 3.0.x's parameters keeps a rollback to a clean 3.0.6 possible and keeps exported JSON readable by 3.0.x.
export const KEYSTORE_SCRYPT_PARAMS = Object.freeze({ N: 1 << 15, p: 1, r: 8 });

// The encoders, as ES modules or CommonJS, wherever they are installed (the SORA SDK brings its own keyring).
const ENCODERS = [
  /\/node_modules\/(?:.+\/)?@(?:subwallet|polkadot)\/keyring\/(?:cjs\/)?pair\/encode\.js$/u,
  /\/node_modules\/(?:.+\/)?@polkadot\/util-crypto\/(?:cjs\/)?json\/encrypt\.js$/u,
];
// A call that passes only the passphrase (`(0, x.scryptEncode)(…)` in CommonJS) uses the library's default cost.
const DEFAULT_COST = /\bscryptEncode(\)?)\(passphrase\)/gu;
const EXPLICIT_COST = `(passphrase, undefined, ${JSON.stringify(KEYSTORE_SCRYPT_PARAMS)})`;
// The default cost itself, so that an encoder the call rewrite cannot see (an aliased import, another argument name)
// still writes what 3.0.x reads. The encoders above pass the cost explicitly; this is the backstop behind them.
// Decoding is unaffected: it reads the cost from each key and checks it against ALLOWED_PARAMS, which stays as is.
const DEFAULTS = /\/node_modules\/(?:.+\/)?@polkadot\/util-crypto\/(?:cjs\/)?scrypt\/defaults\.js$/u;
const DEFAULT_PARAMS = /(DEFAULT_PARAMS = \{\s*N: )1 << \d+(,\s*p: 1,\s*r: 8\s*\})/u;

const normalize = (id) => id.split('?')[0].replaceAll('\\', '/');

export function keystoreScryptParamsPlugin() {
  return {
    name: 'fearless-keystore-scrypt-params',
    enforce: 'pre',
    transform(code, id) {
      if (DEFAULTS.test(normalize(id))) {
        // A util-crypto whose defaults look different fails the build rather than keep a cost nobody checked.
        if (!DEFAULT_PARAMS.test(code)) throw new Error(`Unexpected scrypt defaults: ${id}`);
        return { code: code.replace(DEFAULT_PARAMS, `$1${KEYSTORE_SCRYPT_PARAMS.N}$2`), map: null };
      }
      const calls = code.match(DEFAULT_COST);
      if (!calls) return null;
      // Any other module encrypting at the default cost (a prebuilt bundle of a keyring, new code) fails the
      // build rather than ship keys 3.0.x cannot open.
      if (!ENCODERS.some((encoder) => encoder.test(normalize(id))) || calls.length !== 1) {
        throw new Error(`Encrypts keys at the library's default scrypt cost: ${id}`);
      }
      return { code: code.replace(DEFAULT_COST, (_call, close) => `scryptEncode${close}${EXPLICIT_COST}`), map: null };
    },
  };
}
