// Fearless fail-closed stub for @emurgo/cardano-message-signing-browser 1.1.0 (see README.md).
// Fearless Wallet has no Cardano accounts. @subwallet/keyring imports this library when it loads, for its Cardano
// pair type only, which shipped about 3 MB of WebAssembly into the worker that holds every key. Reading an export
// never throws, so modules that only reference it still load; any Cardano operation refuses.

'use strict';
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

module.exports = {
  AlgorithmId: refusing('AlgorithmId'),
  CBORValue: refusing('CBORValue'),
  COSEKey: refusing('COSEKey'),
  COSESign1Builder: refusing('COSESign1Builder'),
  CurveType: refusing('CurveType'),
  HeaderMap: refusing('HeaderMap'),
  Headers: refusing('Headers'),
  KeyType: refusing('KeyType'),
  ProtectedHeaderMap: refusing('ProtectedHeaderMap'),
  Label: refusing('Label', ["new_text", "new_int"]),
  Int: refusing('Int', ["new_i32"]),
};
