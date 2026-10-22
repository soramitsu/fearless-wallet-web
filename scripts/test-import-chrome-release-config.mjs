#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importChromeReleaseConfig, REQUIRED_PUBLIC_CONFIG_KEYS } from './import-chrome-release-config.mjs';
import { packageExtension } from './package-extension.mjs';

const TEST_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1/GrfVJTMm3BhHOSkdgMWyd2KR7DtyEwOXKxDetfPP6c9ZLXN8EdmOlhIVK5AOr14mY2Rdf/mtyFA0VgwyWl1P8OZiKs1gtn1TPm7wvGpd4ccwIaWQlh+8vIaaG2/bRPc3GtK8WeUT97eSYRTgC7XeFqlP4oHYm3gnqwzKGBQ0tS2cG3scrUuq7OhxXV8GNwDFwVgW3rnBm9KhwP8MpbDBXuapS/0f+4dzp576BjHNuO+EbaLrhYzIE2OwXb0s+w5cO6NVqpjSjpldnZPiicGQzJwyPMfUGclcoj/lUQRF/JtYg5lAiYU6qsh0eiiWn8tsc7f6zJh/Wj1DI0gae0vQIDAQAB';
const TEST_OAUTH_CLIENT = 'fixture.apps.googleusercontent.com';
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-chrome-config-import-'));
const importScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'import-chrome-release-config.mjs');

try {
  const sourceDir = path.join(tempRoot, 'source');
  const zipPath = path.join(tempRoot, 'reference.zip');
  const crxPath = path.join(tempRoot, 'reference.crx');
  const outputPath = path.join(tempRoot, '.env.chrome-release.local');
  await fs.mkdir(sourceDir, { recursive: true });

  const manifest = {
    key: TEST_PUBLIC_KEY,
    manifest_version: 3,
    oauth2: {
      client_id: TEST_OAUTH_CLIENT,
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    },
    version: '3.0.5',
  };
  await fs.writeFile(path.join(sourceDir, 'manifest.json'), `${JSON.stringify(manifest)}\n`);

  const environment = Object.fromEntries(
    REQUIRED_PUBLIC_CONFIG_KEYS.map((key) => [key, key === 'OAUTH_CLIENT_ID' ? TEST_OAUTH_CLIENT : `${key}-value`])
  );
  const orderedKeys = [
    'VUE_APP_FL_WEB_X1_TESTNET_API_KEY',
    ...REQUIRED_PUBLIC_CONFIG_KEYS.filter((key) => key !== 'VUE_APP_FL_WEB_X1_TESTNET_API_KEY'),
  ];
  const environmentLiteral = orderedKeys.map((key) => `${key}:${JSON.stringify(environment[key])}`).join(',');
  await fs.writeFile(path.join(sourceDir, 'popup.js'), `const publishedEnvironment={${environmentLiteral}};\n`);

  await packageExtension({ outputPath: zipPath, sourceDir });
  const zip = await fs.readFile(zipPath);
  const header = Buffer.alloc(13);
  header.write('Cr24', 0, 'ascii');
  header.writeUInt32LE(3, 4);
  header.writeUInt32LE(1, 8);
  const crx = Buffer.concat([header, zip]);
  await fs.writeFile(crxPath, crx);
  const expectedSha256 = createHash('sha256').update(crx).digest('hex');

  const imported = await importChromeReleaseConfig({ crxPath, expectedSha256, outputPath });
  assert.equal(imported.extensionId, 'nhlnehondigmgckngjomcpcefcdplmgc');
  assert.equal(imported.fieldCount, 32);
  const output = await fs.readFile(outputPath, 'utf8');
  assert.match(output, /OAUTH_CLIENT_ID=fixture\.apps\.googleusercontent\.com/u);
  assert.match(output, /EXTENSION_PUBLIC_KEY=MIIB/u);
  assert.equal((await fs.stat(outputPath)).mode & 0o777, 0o600);

  const overrideAttempt = spawnSync(
    process.execPath,
    [importScript, '--crx', crxPath, '--expected-sha256', expectedSha256],
    { encoding: 'utf8' }
  );
  assert.notEqual(overrideAttempt.status, 0);
  assert.match(overrideAttempt.stderr, /unknown argument --expected-sha256/u);

  await assert.rejects(
    importChromeReleaseConfig({ crxPath, expectedSha256: '0'.repeat(64), outputPath: path.join(tempRoot, 'bad.env') }),
    /does not match expected/u
  );
  await assert.rejects(importChromeReleaseConfig({ crxPath, expectedSha256, outputPath }), /output already exists/u);

  environment.FL_WEB_TON_API_KEY = 'unsafe"\\value';
  const unsafeEnvironmentLiteral = orderedKeys.map((key) => `${key}:${JSON.stringify(environment[key])}`).join(',');
  await fs.writeFile(path.join(sourceDir, 'popup.js'), `const publishedEnvironment={${unsafeEnvironmentLiteral}};\n`);
  const unsafeZipPath = path.join(tempRoot, 'unsafe-reference.zip');
  const unsafeCrxPath = path.join(tempRoot, 'unsafe-reference.crx');
  await packageExtension({ outputPath: unsafeZipPath, sourceDir });
  const unsafeCrx = Buffer.concat([header, await fs.readFile(unsafeZipPath)]);
  await fs.writeFile(unsafeCrxPath, unsafeCrx);
  await assert.rejects(
    importChromeReleaseConfig({
      crxPath: unsafeCrxPath,
      expectedSha256: createHash('sha256').update(unsafeCrx).digest('hex'),
      outputPath: path.join(tempRoot, 'unsafe.env'),
    }),
    /cannot be represented safely/u
  );
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

console.log('Chrome release configuration import self-test passed (5 checks)');
