// Fearless fail-closed stub for @emurgo/cardano-message-signing-browser 1.1.0 (see README.md).
// Fearless Wallet has no Cardano accounts. @subwallet/keyring imports this library when it loads, for its Cardano
// pair type only, which shipped about 3 MB of WebAssembly into the worker that holds every key. Reading an export
// never throws, so modules that only reference it still load; any Cardano operation refuses.

const MESSAGE = 'Cardano is not supported by Fearless Wallet; this Cardano library is a fail-closed stub';

function unsupported() {
  throw new Error(MESSAGE);
}

// Plain values for the few constructors @subwallet/keyring calls while its modules load (utils/cardano/coseKey.js).
const INERT = Object.freeze({ fearlessUnsupportedCardanoValue: true });

function refusing(name, inert = []) {
  const target = { [name]: class { constructor() { unsupported(); } } }[name];
  const values = new Set(inert);

  return new Proxy(target, {
    get(object, property, receiver) {
      if (typeof property === 'symbol' || property in object) return Reflect.get(object, property, receiver);
      // Not a promise and not JSON: awaiting or serialising a stub must not call it.
      if (property === 'then' || property === 'toJSON') return undefined;
      if (values.has(property)) return () => INERT;
      return unsupported;
    },
    set() {
      return false;
    },
  });
}

export const AlgorithmId = refusing('AlgorithmId');
export const CBORValue = refusing('CBORValue');
export const COSEKey = refusing('COSEKey');
export const COSESign1Builder = refusing('COSESign1Builder');
export const CurveType = refusing('CurveType');
export const HeaderMap = refusing('HeaderMap');
export const Headers = refusing('Headers');
export const KeyType = refusing('KeyType');
export const ProtectedHeaderMap = refusing('ProtectedHeaderMap');
export const Label = refusing('Label', ["new_text", "new_int"]);
export const Int = refusing('Int', ["new_i32"]);
