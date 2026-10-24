'use strict';

module.exports = function createECDHDisabled() {
  throw new Error(
    'Node-style browser createECDH is disabled; wallet key agreement must use an audited chain-specific implementation'
  );
};
