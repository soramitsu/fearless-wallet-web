'use strict';

function disabled() {
  throw new Error('Android ADB cryptography is disabled in this desktop extension toolchain');
}

// adbkit reads BigInteger at module load even when web-ext targets desktop
// Firefox. Preserve that shape, but never accept a key or verify a signature.
module.exports = Object.freeze({
  jsbn: Object.freeze({ BigInteger: disabled }),
  pki: Object.freeze({
    rsa: Object.freeze({ setPublicKey: disabled, generateKeyPair: disabled }),
    publicKeyFromPem: disabled,
    privateKeyFromPem: disabled,
    decryptRsaPrivateKey: disabled,
  }),
  md: Object.freeze({ md5: Object.freeze({ create: disabled }) }),
});
