#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
  auditChromeRelease,
  deriveChromeExtensionId,
  EXPECTED_CHROME_EXTENSION_ID,
  REQUIRED_PUBLIC_CONFIG_KEYS,
} from './audit-chrome-release.mjs';

const TEST_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1/GrfVJTMm3BhHOSkdgMWyd2KR7DtyEwOXKxDetfPP6c9ZLXN8EdmOlhIVK5AOr14mY2Rdf/mtyFA0VgwyWl1P8OZiKs1gtn1TPm7wvGpd4ccwIaWQlh+8vIaaG2/bRPc3GtK8WeUT97eSYRTgC7XeFqlP4oHYm3gnqwzKGBQ0tS2cG3scrUuq7OhxXV8GNwDFwVgW3rnBm9KhwP8MpbDBXuapS/0f+4dzp576BjHNuO+EbaLrhYzIE2OwXb0s+w5cO6NVqpjSjpldnZPiicGQzJwyPMfUGclcoj/lUQRF/JtYg5lAiYU6qsh0eiiWn8tsc7f6zJh/Wj1DI0gae0vQIDAQAB';
const WRONG_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj/u/XDdjlDyw7gHEtaaasZ9GdG8WOKAyJzXd8HFrDtz2Jcuy7er7MtWvHgNDA0bwpznbI5YdZeV4UfCEsA4SrA5b3MnWTHwA1bgbiDM+L9rrqvcadcKuOlTeN48Q0ijmhHlNFbTzvT9W0zw/GKv8LgXAHggxtmHQ/Z9PP2QNF5O8rUHHSL4AJ6hNcEKSBVSmbbjeVm4gSXDuED5r0nwxvRtupDxGYp8IZpP5KlExqNu1nbkPc+igCTIB6XsqijagzxewUHCdovmkb2JNtskx/PMIEv+TvWIx2BzqGp71gSh/dV7SJ3rClvWd2xj8dtxG8FfAWDTIIi0qZXWn2QhizQIDAQAB';
const ZIP_NAME = 'fearless-wallet-extension-chrome.zip';
const TEST_RELEASE_ENVIRONMENT = Object.fromEntries(
  REQUIRED_PUBLIC_CONFIG_KEYS.map((key) => [
    key,
    key === 'OAUTH_CLIENT_ID' ? 'fixture.apps.googleusercontent.com' : `fixture-${key.toLowerCase()}`,
  ])
);
const TEST_OAUTH_CLIENT_ID_SHA256 = createHash('sha256').update(TEST_RELEASE_ENVIRONMENT.OAUTH_CLIENT_ID).digest('hex');
Object.assign(process.env, TEST_RELEASE_ENVIRONMENT);
const CRC32_TABLE = makeCrc32Table();
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const auditScript = path.join(scriptDirectory, 'audit-chrome-release.mjs');

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii');
  const bytes = Buffer.alloc(12 + data.length);
  bytes.writeUInt32BE(data.length, 0);
  typeBytes.copy(bytes, 4);
  data.copy(bytes, 8);
  bytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return bytes;
}

function pngIcon(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const scanlines = Buffer.alloc(size * (1 + size * 4));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND'),
  ]);
}

function baseManifest() {
  return {
    action: { default_popup: 'popup.html#/', default_title: 'Fearless Wallet' },
    author: 'Soramitsu',
    background: { service_worker: 'background.js', type: 'module' },
    content_scripts: [{ js: ['content.js'], matches: ['https://*/*', 'http://*/*'], run_at: 'document_start' }],
    content_security_policy: {
      extension_pages:
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-src https:; frame-ancestors https:; connect-src https: wss: ws:; media-src https:",
    },
    description: 'Non-custodial multichain wallet for Polkadot, Ethereum, TON, Bitcoin, Solana, and SORA ecosystems.',
    homepage_url: 'https://fearlesswallet.io/',
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icons/logo-16.png',
      32: 'icons/logo-32.png',
      48: 'icons/logo-48.png',
      64: 'icons/logo-64.png',
      128: 'icons/logo-128.png',
    },
    key: TEST_PUBLIC_KEY,
    manifest_version: 3,
    minimum_chrome_version: '102',
    name: 'Fearless Wallet',
    oauth2: {
      client_id: TEST_RELEASE_ENVIRONMENT.OAUTH_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/drive.appdata'],
    },
    permissions: ['storage', 'tabs', 'identity', 'clipboardRead', 'alarms'],
    short_name: 'FW',
    version: '3.0.6',
    web_accessible_resources: [
      { matches: ['https://*/*', 'http://*/*', 'http://localhost/*'], resources: ['page.js'] },
    ],
  };
}

function baseFiles(manifest) {
  const compiledReleaseEnvironment = Object.values(TEST_RELEASE_ENVIRONMENT).join('|');
  const files = new Map([
    ['manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
    [
      'extension-build-metadata.json',
      Buffer.from(
        `${JSON.stringify(
          {
            browser: 'chrome',
            mode: 'production',
            releaseFlags: {
              VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
              VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
              VUE_APP_EXTENSION_SMOKE: 'false',
              VUE_APP_TEST_ONLY: 'false',
            },
            schemaVersion: 1,
          },
          null,
          2
        )}\n`
      ),
    ],
    [
      'background.js',
      Buffer.from(
        `export const background = true; export const oauthClient = ${JSON.stringify(
          manifest.oauth2?.client_id ?? ''
        )}; export const releaseEnvironment = ${JSON.stringify(compiledReleaseEnvironment)};\n`
      ),
    ],
    ['content.js', Buffer.from('globalThis.fearlessContent = true;\n')],
    ['page.js', Buffer.from('globalThis.fearlessPage = true;\n')],
    ['popup.html', Buffer.from('<!doctype html><script type="module" src="./popup.js"></script>\n')],
    ['popup.js', Buffer.from('export const popup = true;\n')],
  ]);
  for (const size of [16, 32, 48, 64, 128]) files.set(`icons/logo-${size}.png`, pngIcon(size));
  return files;
}

function storedZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '');
    const checksum = entry.crc ?? crc32(data);
    const mode = entry.mode ?? 0o100644;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function writeArtifactFiles(distDir, files) {
  for (const [name, content] of files) {
    const destination = path.join(distDir, ...name.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
}

let fixtureNumber = 0;
async function createFixture(tempRoot, label, options = {}) {
  fixtureNumber += 1;
  const rootDir = path.join(
    tempRoot,
    `${String(fixtureNumber).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/giu, '-')}`
  );
  const distDir = path.join(rootDir, 'dist/extension/chrome');
  const zipPath = path.join(distDir, ZIP_NAME);
  const manifest = baseManifest();
  options.mutateManifest?.(manifest);
  const packageVersion = options.packageVersion ?? manifest.version;
  await fs.mkdir(distDir, { recursive: true });
  await fs.writeFile(
    path.join(rootDir, 'package.json'),
    `${JSON.stringify({ description: manifest.description, name: 'fixture', version: packageVersion }, null, 2)}\n`
  );

  const files = baseFiles(manifest);
  for (const name of options.removeFiles ?? []) files.delete(name);
  for (const [name, content] of options.extraFiles ?? []) files.set(name, Buffer.from(content));
  options.mutateFiles?.(files);
  await writeArtifactFiles(distDir, files);

  let zipEntries = [...files].map(([name, data]) => ({ data, name }));
  if (options.mutateZipEntries) zipEntries = options.mutateZipEntries(zipEntries);
  await fs.writeFile(zipPath, storedZip(zipEntries));
  if (options.appendZipJunk) await fs.appendFile(zipPath, Buffer.from('trailing-junk'));
  return { distDir, rootDir, zipPath };
}

let passed = 0;
async function expectPass(tempRoot, label, options = {}, auditOptions = {}) {
  const fixture = await createFixture(tempRoot, label, options);
  await auditChromeRelease({ ...fixture, expectedOAuthClientIdSha256: TEST_OAUTH_CLIENT_ID_SHA256, ...auditOptions });
  passed += 1;
  return fixture;
}

async function expectFailure(tempRoot, label, options, expected, auditOptions = {}) {
  const fixture = await createFixture(tempRoot, label, options);
  try {
    await auditChromeRelease({
      ...fixture,
      expectedOAuthClientIdSha256: TEST_OAUTH_CLIENT_ID_SHA256,
      ...auditOptions,
    });
  } catch (error) {
    if (!expected.test(error.message))
      throw new Error(`${label}: expected ${expected}, received ${JSON.stringify(error.message)}`);
    passed += 1;
    return;
  }
  throw new Error(`${label}: audit unexpectedly passed`);
}

async function run() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-chrome-release-audit-'));
  try {
    if (deriveChromeExtensionId(TEST_PUBLIC_KEY) !== EXPECTED_CHROME_EXTENSION_ID)
      throw new Error('known Chrome public key did not derive the stable extension ID');
    passed += 1;

    const clean = await expectPass(tempRoot, 'clean-release', {}, { release: true });
    const cli = spawnSync(
      process.execPath,
      [auditScript, '--root', clean.rootDir, '--dist', clean.distDir, '--zip', clean.zipPath],
      { encoding: 'utf8' }
    );
    if (cli.status !== 0 || !cli.stdout.includes('Chrome release audit passed')) {
      throw new Error(`release CLI failed: ${cli.stderr || cli.stdout}`);
    }
    passed += 1;

    await expectPass(tempRoot, 'non-release-without-identity', {
      mutateManifest(manifest) {
        delete manifest.key;
        delete manifest.oauth2;
      },
    });
    await expectFailure(
      tempRoot,
      'release-missing-key',
      { mutateManifest: (manifest) => delete manifest.key },
      /requires manifest key/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-missing-oauth',
      { mutateManifest: (manifest) => delete manifest.oauth2 },
      /requires manifest oauth2/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-invalid-oauth-client',
      { mutateManifest: (manifest) => (manifest.oauth2.client_id = 'not-a-google-client') },
      /requires a Google OAuth client_id/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-oauth-environment-mismatch',
      { mutateManifest: (manifest) => (manifest.oauth2.client_id = 'wrong.apps.googleusercontent.com') },
      /does not match OAUTH_CLIENT_ID/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-unreviewed-oauth-client',
      { mutateManifest: (manifest) => (manifest.oauth2.client_id = 'wrong.apps.googleusercontent.com') },
      /does not match the reviewed published client/u,
      {
        release: true,
        releaseEnvironment: { ...TEST_RELEASE_ENVIRONMENT, OAUTH_CLIENT_ID: 'wrong.apps.googleusercontent.com' },
      }
    );
    await expectFailure(
      tempRoot,
      'release-invalid-oauth-scope',
      { mutateManifest: (manifest) => (manifest.oauth2.scopes = ['drive.appdata']) },
      /requires exactly the Google Drive appdata OAuth scope/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-oauth-not-compiled',
      {
        mutateFiles: (files) => files.set('background.js', Buffer.from('export const background = true;\n')),
      },
      /OAuth client_id is not compiled into a reviewed entrypoint or popup preload/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-wrong-key',
      { mutateManifest: (manifest) => (manifest.key = WRONG_PUBLIC_KEY) },
      /derives Chrome extension ID .* expected/u,
      { release: true }
    );
    await expectFailure(
      tempRoot,
      'release-missing-public-client-config',
      {},
      /requires non-empty FL_WEB_TON_API_KEY/u,
      {
        release: true,
        releaseEnvironment: { ...TEST_RELEASE_ENVIRONMENT, FL_WEB_TON_API_KEY: '' },
      }
    );
    await expectFailure(
      tempRoot,
      'release-public-client-config-not-compiled',
      {},
      /FL_WEB_TON_API_KEY is not compiled into a reviewed entrypoint or popup preload/u,
      {
        release: true,
        releaseEnvironment: { ...TEST_RELEASE_ENVIRONMENT, FL_WEB_TON_API_KEY: 'not-in-artifact' },
      }
    );
    await expectFailure(
      tempRoot,
      'release-public-client-config-only-in-unreachable-decoy',
      { extraFiles: [['decoy.js', 'export const decoy = "not-in-runtime";\n']] },
      /FL_WEB_TON_API_KEY is not compiled into a reviewed entrypoint or popup preload/u,
      {
        release: true,
        releaseEnvironment: { ...TEST_RELEASE_ENVIRONMENT, FL_WEB_TON_API_KEY: 'not-in-runtime' },
      }
    );
    await expectFailure(
      tempRoot,
      'published-version',
      { mutateManifest: (manifest) => (manifest.version = '3.0.5') },
      /must be greater than published version 3\.0\.5/u
    );
    await expectFailure(
      tempRoot,
      'package-version-mismatch',
      { packageVersion: '3.0.7' },
      /does not match package\.json/u
    );
    await expectFailure(
      tempRoot,
      'invalid-chrome-version',
      { mutateManifest: (manifest) => (manifest.version = '3.00.6') },
      /Chrome's one-to-four-component/u
    );
    await expectFailure(
      tempRoot,
      'invalid-minimum-chrome-version',
      { mutateManifest: (manifest) => (manifest.minimum_chrome_version = '92.x') },
      /minimum_chrome_version must use Chrome/u
    );
    await expectFailure(
      tempRoot,
      'unsupported-minimum-chrome-version',
      { mutateManifest: (manifest) => (manifest.minimum_chrome_version = '101') },
      /minimum_chrome_version must equal the reviewed value 102/u
    );
    await expectFailure(
      tempRoot,
      'raised-minimum-chrome-version',
      { mutateManifest: (manifest) => (manifest.minimum_chrome_version = '9999') },
      /minimum_chrome_version must equal the reviewed value 102/u
    );
    await expectFailure(
      tempRoot,
      'manifest-v2',
      { mutateManifest: (manifest) => (manifest.manifest_version = 2) },
      /manifest_version 3/u
    );
    await expectFailure(
      tempRoot,
      'classic-background-worker',
      { mutateManifest: (manifest) => (manifest.background.type = 'classic') },
      /background service worker must use module type/u
    );
    await expectFailure(
      tempRoot,
      'extra-background-key',
      { mutateManifest: (manifest) => (manifest.background.scripts = ['background.js']) },
      /background keys differ from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'extra-action-key',
      { mutateManifest: (manifest) => (manifest.action.default_icon = 'icons/logo-16.png') },
      /action keys differ from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'popup-route-drift',
      { mutateManifest: (manifest) => (manifest.action.default_popup = 'popup.html#unexpected-route') },
      /action\.default_popup must equal popup\.html#\//u
    );
    await expectFailure(
      tempRoot,
      'sensitive-top-level-key',
      { mutateManifest: (manifest) => (manifest.externally_connectable = { matches: ['https://example.com/*'] }) },
      /top-level manifest keys differ from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'extra-permission',
      { mutateManifest: (manifest) => manifest.permissions.push('downloads') },
      /permissions differs from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'extra-host-permission',
      { mutateManifest: (manifest) => manifest.host_permissions.push('file:///*') },
      /host_permissions differs from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'content-script-match-drift',
      { mutateManifest: (manifest) => manifest.content_scripts[0].matches.push('<all_urls>') },
      /content script matches differs from the reviewed allowlist/u
    );
    await expectFailure(
      tempRoot,
      'unsafe-csp-drift',
      {
        mutateManifest: (manifest) =>
          (manifest.content_security_policy.extension_pages += " script-src-elem 'unsafe-eval';"),
      },
      /extension page CSP differs from the reviewed policy/u
    );
    await expectFailure(
      tempRoot,
      'long-description',
      { mutateManifest: (manifest) => (manifest.description = 'x'.repeat(133)) },
      /description must equal the reviewed package description/u
    );
    await expectFailure(
      tempRoot,
      'name-drift',
      { mutateManifest: (manifest) => (manifest.name = { unexpected: true }) },
      /name must be Fearless Wallet/u
    );
    await expectFailure(
      tempRoot,
      'short-name-drift',
      { mutateManifest: (manifest) => (manifest.short_name = 17) },
      /short_name must be FW/u
    );
    await expectFailure(
      tempRoot,
      'author-drift',
      { mutateManifest: (manifest) => (manifest.author = { unexpected: true }) },
      /author must be Soramitsu/u
    );
    await expectFailure(
      tempRoot,
      'homepage-drift',
      { mutateManifest: (manifest) => (manifest.homepage_url = 'javascript:invalid') },
      /homepage_url must be https:\/\/fearlesswallet\.io\//u
    );
    await expectFailure(tempRoot, 'missing-page', { removeFiles: ['page.js'] }, /missing required file page\.js/u);
    await expectFailure(
      tempRoot,
      'wrong-icon-size',
      { mutateFiles: (files) => files.set('icons/logo-48.png', pngIcon(47)) },
      /must be 48x48 pixels/u
    );
    await expectFailure(
      tempRoot,
      'truncated-icon',
      {
        mutateFiles: (files) => files.set('icons/logo-48.png', files.get('icons/logo-48.png').subarray(0, -4)),
      },
      /truncated PNG chunk|complete PNG IEND/u
    );
    await expectFailure(
      tempRoot,
      'source-map-file',
      { extraFiles: [['chunks/background.js.map', '{}']] },
      /contains a source map/u
    );
    await expectFailure(
      tempRoot,
      'missing-build-metadata',
      { removeFiles: ['extension-build-metadata.json'] },
      /missing extension-build-metadata\.json/u
    );
    await expectFailure(
      tempRoot,
      'test-only-production-build',
      {
        mutateFiles(files) {
          const metadata = JSON.parse(files.get('extension-build-metadata.json').toString('utf8'));
          metadata.releaseFlags.VUE_APP_TEST_ONLY = 'true';
          files.set('extension-build-metadata.json', Buffer.from(`${JSON.stringify(metadata)}\n`));
        },
      },
      /release flag VUE_APP_TEST_ONLY must be false/u
    );
    await expectFailure(
      tempRoot,
      'inline-source-map',
      {
        mutateFiles: (files) =>
          files.set('background.js', Buffer.from('//# sourceMappingURL=data:application/json,e30=\n')),
      },
      /embeds a source map reference/u
    );
    await expectFailure(
      tempRoot,
      'smoke-control',
      { extraFiles: [['smoke-control.html', '<!doctype html>']] },
      /contains smoke-control output/u
    );
    await expectFailure(
      tempRoot,
      'wrapper-directory',
      { mutateZipEntries: (entries) => entries.map((entry) => ({ ...entry, name: `chrome/${entry.name}` })) },
      /manifest\.json at the archive root/u
    );
    await expectFailure(
      tempRoot,
      'path-traversal',
      { mutateZipEntries: (entries) => [...entries, { data: 'escape', name: '../escape.js' }] },
      /traverses/u
    );
    await expectFailure(
      tempRoot,
      'nested-self-archive',
      { mutateZipEntries: (entries) => [...entries, { data: 'zip', name: ZIP_NAME }] },
      /nested or self archive/u
    );
    await expectFailure(
      tempRoot,
      'symlink-entry',
      { mutateZipEntries: (entries) => [...entries, { data: 'background.js', mode: 0o120777, name: 'link.js' }] },
      /symbolic link/u
    );
    await expectFailure(
      tempRoot,
      'duplicate-entry',
      { mutateZipEntries: (entries) => [...entries, { ...entries[0] }] },
      /duplicate entry/u
    );
    await expectFailure(
      tempRoot,
      'case-colliding-entry',
      { mutateZipEntries: (entries) => [...entries, { data: 'collision', name: 'Background.js' }] },
      /case-colliding entry/u
    );
    await expectFailure(
      tempRoot,
      'directory-zip-mismatch',
      {
        mutateZipEntries: (entries) =>
          entries.map((entry) =>
            entry.name === 'background.js' ? { ...entry, data: Buffer.from('different') } : entry
          ),
      },
      /not byte-for-byte identical/u
    );
    await expectFailure(tempRoot, 'zip-trailing-junk', { appendZipJunk: true }, /trailing junk/u);
    await expectFailure(
      tempRoot,
      'bad-crc',
      { mutateZipEntries: (entries) => entries.map((entry, index) => (index === 0 ? { ...entry, crc: 0 } : entry)) },
      /CRC-32/u
    );

    console.log(`Chrome release audit self-test passed (${passed} checks).`);
  } finally {
    await fs.rm(tempRoot, { force: true, recursive: true });
  }
}

run().catch((error) => {
  console.error(`Chrome release audit self-test failed after ${passed} checks: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
