#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  CURRENT_PUBLISHED_VERSION,
  deriveChromeExtensionId,
  EXPECTED_CHROME_EXTENSION_ID,
  readZipEntries,
  REQUIRED_PUBLIC_CONFIG_KEYS,
} from './audit-chrome-release.mjs';

export const CURRENT_PUBLISHED_CRX_SHA256 = 'be6e2d4c4cb8072ced8e3813f470db914ef657d2c301425d4a7979f936b31704';
export { REQUIRED_PUBLIC_CONFIG_KEYS };

const DEFAULT_OUTPUT = '.env.chrome-release.local';
const ENV_OBJECT_MARKER = '{VUE_APP_FL_WEB_X1_TESTNET_API_KEY:';

function fail(message) {
  throw new Error(message);
}

function parseCrx3(bytes) {
  if (bytes.length < 13 || bytes.toString('ascii', 0, 4) !== 'Cr24') fail('reference package is not a CRX file');
  if (bytes.readUInt32LE(4) !== 3) fail('reference package must use CRX3');

  const headerLength = bytes.readUInt32LE(8);
  if (headerLength === 0) fail('reference CRX3 header is empty');
  const zipOffset = 12 + headerLength;
  if (zipOffset >= bytes.length) fail('reference CRX3 header is truncated');
  return bytes.subarray(zipOffset);
}

function extractObjectLiteral(source, start) {
  let depth = 0;
  let escaped = false;
  let quote = '';

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return source.slice(start, index + 1);
  }

  fail('published JavaScript environment block is truncated');
}

function parsePublishedEnvironment(files) {
  for (const [name, bytes] of files) {
    if (!name.endsWith('.js')) continue;
    const source = bytes.toString('utf8');
    const start = source.indexOf(ENV_OBJECT_MARKER);
    if (start === -1) continue;

    const literal = extractObjectLiteral(source, start).replace(/([{,])([A-Z][A-Z0-9_]*):/gu, '$1"$2":');
    try {
      return JSON.parse(literal);
    } catch (error) {
      fail(`cannot parse published JavaScript environment block in ${name}: ${error.message}`);
    }
  }

  fail('published JavaScript does not contain the expected production configuration block');
}

function parseManifest(files) {
  const bytes = files.get('manifest.json');
  if (!bytes) fail('reference CRX has no root manifest.json');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`reference manifest.json is invalid: ${error.message}`);
  }
}

export async function importChromeReleaseConfig({
  crxPath,
  expectedSha256 = CURRENT_PUBLISHED_CRX_SHA256,
  force = false,
  outputPath = DEFAULT_OUTPUT,
}) {
  crxPath = path.resolve(crxPath);
  outputPath = path.resolve(outputPath);
  const crx = await fs.readFile(crxPath).catch((error) => fail(`cannot read reference CRX: ${error.message}`));
  const crxSha256 = createHash('sha256').update(crx).digest('hex');
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256) || crxSha256 !== expectedSha256) {
    fail(`reference CRX SHA-256 ${crxSha256} does not match expected ${expectedSha256}`);
  }

  const files = readZipEntries(parseCrx3(crx), 'Published Chrome Web Store CRX');
  const manifest = parseManifest(files);
  if (manifest.version !== CURRENT_PUBLISHED_VERSION) {
    fail(`reference CRX version ${manifest.version} is not expected published version ${CURRENT_PUBLISHED_VERSION}`);
  }
  if (typeof manifest.key !== 'string' || !manifest.key.trim()) fail('reference manifest has no public key');
  const extensionId = deriveChromeExtensionId(manifest.key);
  if (extensionId !== EXPECTED_CHROME_EXTENSION_ID) {
    fail(`reference manifest derives extension ID ${extensionId}, expected ${EXPECTED_CHROME_EXTENSION_ID}`);
  }
  if (typeof manifest.oauth2?.client_id !== 'string' || !manifest.oauth2.client_id) {
    fail('reference manifest has no OAuth client ID');
  }

  const publishedEnvironment = parsePublishedEnvironment(files);
  for (const key of REQUIRED_PUBLIC_CONFIG_KEYS) {
    if (typeof publishedEnvironment[key] !== 'string' || !publishedEnvironment[key]) {
      fail(`reference JavaScript has no ${key}`);
    }
  }
  if (publishedEnvironment.OAUTH_CLIENT_ID !== manifest.oauth2.client_id) {
    fail('reference manifest and JavaScript contain different OAuth client IDs');
  }

  const releaseEnvironment = {
    ...Object.fromEntries(REQUIRED_PUBLIC_CONFIG_KEYS.map((key) => [key, publishedEnvironment[key]])),
    EXTENSION_PUBLIC_KEY: manifest.key,
    IS_EXTENSION: 'true',
    NODE_ENV: 'production',
    VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
    VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
    VUE_APP_EXTENSION_SMOKE: 'false',
    VUE_APP_TEST_ONLY: 'false',
  };
  const lines = Object.entries(releaseEnvironment)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => {
      if (/[\r\n]/u.test(value)) fail(`${key} contains a newline`);
      if (!/^[A-Za-z0-9._+/=-]+$/u.test(value)) {
        fail(`${key} contains a character that cannot be represented safely in the local dotenv file`);
      }
      return `${key}=${value}`;
    });

  if (!force) {
    const exists = await fs
      .access(outputPath)
      .then(() => true)
      .catch(() => false);
    if (exists) fail(`output already exists: ${outputPath}; pass --force to replace this generated file`);
  }

  const temporaryPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.tmp-${process.pid}`);
  await fs.writeFile(temporaryPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(temporaryPath, outputPath);
  await fs.chmod(outputPath, 0o600);

  return {
    crxSha256,
    extensionId,
    fieldCount: lines.length,
    outputPath,
    version: manifest.version,
  };
}

function usage() {
  return `Usage: node scripts/import-chrome-release-config.mjs --crx FILE [--output FILE] [--force]\n\nImports public client-side release identifiers from the exact hash-pinned published CRX into an ignored mode-600 local environment file. Values are never printed.`;
}

function parseArguments(argv) {
  let crxPath;
  let force = false;
  let outputPath = DEFAULT_OUTPUT;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--force') {
      force = true;
      continue;
    }
    if (!['--crx', '--output'].includes(argument)) fail(`unknown argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${argument} requires a value`);
    index += 1;
    if (argument === '--crx') crxPath = value;
    else outputPath = value;
  }

  if (!crxPath) fail('--crx is required');
  return { crxPath, force, outputPath };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await importChromeReleaseConfig(options);
    console.log(
      `Imported ${result.fieldCount} public release configuration fields from Chrome Web Store ${result.version}; extension ID ${result.extensionId}; CRX SHA-256 ${result.crxSha256}; values were not printed.`
    );
  } catch (error) {
    console.error(`Chrome release configuration import failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
