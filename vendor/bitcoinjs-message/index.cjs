'use strict';

const DISABLED_MESSAGE =
  'Legacy Bitcoin message signing is disabled; Fearless Bitcoin sends use the audited BIP84 transaction path';

function disabled() {
  throw new Error(DISABLED_MESSAGE);
}

module.exports = {
  magicHash: disabled,
  sign: disabled,
  verify: disabled,
};
