#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  enforceProductionReleaseEnvironment,
  PRODUCTION_RELEASE_FLAGS,
  TRANSFER_TEST_EXTENSION_PUBLIC_KEY,
  TRANSFER_TEST_RELEASE_FLAGS,
} from './build-extension.mjs';
import { commonViteConfig } from '../vite.config.shared.mjs';

const productionEnvironment = {
  EXTENSION_PUBLIC_KEY: 'published-extension-key',
  OAUTH_CLIENT_ID: 'published.apps.googleusercontent.com',
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
assert.equal(productionEnvironment.VUE_APP_TRANSFER_TESTING, 'false');
assert.equal(productionEnvironment.EXTENSION_PUBLIC_KEY, 'published-extension-key');
assert.equal(productionEnvironment.OAUTH_CLIENT_ID, 'published.apps.googleusercontent.com');

const transferTestEnvironment = {
  EXTENSION_PUBLIC_KEY: 'published-extension-key',
  OAUTH_CLIENT_ID: 'published.apps.googleusercontent.com',
  UNRELATED_VALUE: 'preserved',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'true',
  VUE_APP_TEST_ONLY: 'true',
};
enforceProductionReleaseEnvironment(transferTestEnvironment, 'production', { transferTest: true });
assert.deepEqual(
  Object.fromEntries(Object.keys(TRANSFER_TEST_RELEASE_FLAGS).map((key) => [key, transferTestEnvironment[key]])),
  TRANSFER_TEST_RELEASE_FLAGS
);
assert.equal(transferTestEnvironment.UNRELATED_VALUE, 'preserved');
assert.equal(transferTestEnvironment.VUE_APP_TRANSFER_TESTING, 'true');
assert.equal(transferTestEnvironment.EXTENSION_PUBLIC_KEY, TRANSFER_TEST_EXTENSION_PUBLIC_KEY);
assert.equal(transferTestEnvironment.OAUTH_CLIENT_ID, '');

const developmentEnvironment = { VUE_APP_TEST_ONLY: 'true' };
enforceProductionReleaseEnvironment(developmentEnvironment, 'development');
assert.equal(developmentEnvironment.VUE_APP_TEST_ONLY, 'true');

const policyKeys = [
  'IS_EXTENSION',
  'VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY',
  'VUE_APP_ENABLE_BITCOIN_TRANSFERS',
  'VUE_APP_ENABLE_IROHA_TRANSFERS',
  'VUE_APP_EXTENSION_SMOKE',
  'VUE_APP_IROHA_TRANSFER_COMPATIBILITY',
  'VUE_APP_TEST_ONLY',
  'VUE_APP_TRANSFER_TESTING',
];
const originalPolicyEnvironment = Object.fromEntries(policyKeys.map((key) => [key, process.env[key]]));
try {
  Object.assign(process.env, {
    IS_EXTENSION: 'true',
    VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY: 'disabled',
    VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
    VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
    VUE_APP_EXTENSION_SMOKE: 'false',
    VUE_APP_IROHA_TRANSFER_COMPATIBILITY: 'disabled',
    VUE_APP_TEST_ONLY: 'false',
    VUE_APP_TRANSFER_TESTING: 'false',
  });
  assert.throws(
    () => commonViteConfig({ mode: 'production', outDir: 'unused' }),
    /bitcoin_testnet_broadcast_evidence_missing/u
  );

  Object.assign(process.env, {
    VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY: 'testnet-only',
    VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
    VUE_APP_ENABLE_IROHA_TRANSFERS: 'true',
    VUE_APP_IROHA_TRANSFER_COMPATIBILITY: 'legacy-offline-only',
    VUE_APP_TRANSFER_TESTING: 'true',
  });
  assert.equal(commonViteConfig({ mode: 'production', outDir: 'unused' }).build.outDir, 'unused');

  process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'false';
  assert.throws(
    () => commonViteConfig({ mode: 'production', outDir: 'unused' }),
    /invalid_transfer_test_profile/u
  );
} finally {
  for (const [key, value] of Object.entries(originalPolicyEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log('Extension production environment self-test passed (14 checks)');
