#!/usr/bin/env node

import assert from 'node:assert/strict';

import { enforceProductionReleaseEnvironment, PRODUCTION_RELEASE_FLAGS } from './build-extension.mjs';

const productionEnvironment = {
  UNRELATED_VALUE: 'preserved',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'true',
  VUE_APP_EXTENSION_SMOKE: 'true',
  VUE_APP_TEST_ONLY: 'true',
};
enforceProductionReleaseEnvironment(productionEnvironment, 'production');
assert.deepEqual(
  Object.fromEntries(Object.keys(PRODUCTION_RELEASE_FLAGS).map((key) => [key, productionEnvironment[key]])),
  PRODUCTION_RELEASE_FLAGS
);
assert.equal(productionEnvironment.UNRELATED_VALUE, 'preserved');

const developmentEnvironment = { VUE_APP_TEST_ONLY: 'true' };
enforceProductionReleaseEnvironment(developmentEnvironment, 'development');
assert.equal(developmentEnvironment.VUE_APP_TEST_ONLY, 'true');

console.log('Extension production environment self-test passed (3 checks)');
