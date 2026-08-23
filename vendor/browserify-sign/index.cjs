'use strict';

const DISABLED_MESSAGE =
  'Node-style browser createSign/createVerify is disabled; wallet signing must use an audited chain-specific implementation';

function disabled() {
  throw new Error(DISABLED_MESSAGE);
}

module.exports = {
  Sign: disabled,
  Verify: disabled,
  createSign: disabled,
  createVerify: disabled,
};
