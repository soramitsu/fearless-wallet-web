'use strict';

const DISABLED_MESSAGE =
  'Subwallet BIP-322 message signing is disabled; Fearless Bitcoin sends use the audited BIP84 transaction path';

class Signer {
  static sign() {
    throw new Error(DISABLED_MESSAGE);
  }
}

module.exports = { Signer };
