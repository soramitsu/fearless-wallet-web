#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const VENDORED_IROHA_ARCHIVE = 'vendor/iroha-js/iroha-iroha-js-0.0.2.tgz';
export const VENDORED_IROHA_DEPENDENCY = `file:${VENDORED_IROHA_ARCHIVE}`;
export const VENDORED_IROHA_ARCHIVE_BYTES = 1_843_179;
export const VENDORED_IROHA_ARCHIVE_SHA256 = '68def75061c3842cd2fddbd4629b1ceaf80b2b1ff3069a477596ada9bae61339';
export const VENDORED_IROHA_FILE_COUNT = 141;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PREFIX = 'package/';
const REQUIRED_EXPORTS = {
  '.': { import: './dist/index.js', types: './index.d.ts' },
  './browser': {
    browser: './dist/browser.js',
    import: './dist/browser.js',
    types: './index.d.ts',
  },
  './crypto': {
    browser: './dist/crypto.browser.js',
    import: './dist/crypto.js',
    types: './index.d.ts',
  },
  './instruction-builders': {
    import: './dist/instructionBuilders.js',
    types: './index.d.ts',
  },
  './nexus-app': {
    browser: './dist/nexusApp.js',
    import: './dist/nexusApp.js',
    types: './nexus-app.d.ts',
  },
  './torii-browser': {
    browser: './dist/toriiBrowserClient.js',
    import: './dist/toriiBrowserClient.js',
    types: './index.d.ts',
  },
};
const FORBIDDEN_EXPORTS = ['./ivm-artifact', './transaction-codec'];
const BROWSER_NATIVE_FAILURE = 'iroha_js_host is unavailable in browser builds.';

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readString(buffer, start, length) {
  const field = buffer.subarray(start, start + length);
  const nul = field.indexOf(0);
  return field.subarray(0, nul === -1 ? field.length : nul).toString('utf8');
}

function readOctal(buffer, start, length, label) {
  const source = readString(buffer, start, length).trim();
  if (!/^[0-7]+$/u.test(source)) fail(`archive ${label} is not canonical octal`);
  const value = Number.parseInt(source, 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(`archive ${label} is outside the safe integer range`);
  return value;
}

function isZeroBlock(buffer) {
  return buffer.every((value) => value === 0);
}

function validateArchivePath(archivePath) {
  if (
    !archivePath.startsWith(PACKAGE_PREFIX) ||
    archivePath === PACKAGE_PREFIX ||
    archivePath.endsWith('/') ||
    archivePath.includes('\\') ||
    path.posix.isAbsolute(archivePath)
  ) {
    fail(`archive path is outside the package root: ${JSON.stringify(archivePath)}`);
  }
  const segments = archivePath.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail(`archive path contains an unsafe segment: ${JSON.stringify(archivePath)}`);
  }
  if (path.posix.normalize(archivePath) !== archivePath) {
    fail(`archive path is not normalized: ${JSON.stringify(archivePath)}`);
  }
}

export function parseReviewedIrohaArchive(compressedArchive) {
  const archive = gunzipSync(compressedArchive);
  const files = new Map();
  let offset = 0;
  let foundEndMarker = false;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (isZeroBlock(header)) {
      foundEndMarker = true;
      if (!isZeroBlock(archive.subarray(offset))) fail('archive contains non-zero data after its end marker');
      break;
    }

    const storedChecksum = readOctal(header, 148, 8, 'header checksum');
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const computedChecksum = checksumHeader.reduce((sum, value) => sum + value, 0);
    if (storedChecksum !== computedChecksum) fail('archive header checksum mismatch');

    const name = readString(header, 0, 100);
    const prefix = readString(header, 345, 155);
    const archivePath = prefix ? `${prefix}/${name}` : name;
    validateArchivePath(archivePath);

    const type = header[156];
    if (type !== 0 && type !== 0x30) {
      fail(`archive contains a link or special-file entry: ${archivePath}`);
    }
    const size = readOctal(header, 124, 12, `entry size for ${archivePath}`);
    const contentStart = offset + 512;
    const contentEnd = contentStart + size;
    if (contentEnd > archive.length) fail(`archive entry is truncated: ${archivePath}`);

    const relativePath = archivePath.slice(PACKAGE_PREFIX.length);
    if (files.has(relativePath)) fail(`archive contains a duplicate path: ${archivePath}`);
    files.set(relativePath, Buffer.from(archive.subarray(contentStart, contentEnd)));

    offset = contentStart + Math.ceil(size / 512) * 512;
  }

  if (!foundEndMarker) fail('archive is missing its zero-block end marker');
  return files;
}

function parseJsonFile(files, relativePath) {
  const value = files.get(relativePath);
  if (!value) fail(`archive is missing ${relativePath}`);
  try {
    return JSON.parse(value.toString('utf8'));
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error.message}`);
  }
}

function validatePackageContents(files) {
  if (files.size !== VENDORED_IROHA_FILE_COUNT) {
    fail(`archive has ${files.size} files, expected ${VENDORED_IROHA_FILE_COUNT}`);
  }
  if ([...files.keys()].some((relativePath) => relativePath.toLowerCase().endsWith('.node'))) {
    fail('archive must not contain a native .node binary');
  }

  const pkg = parseJsonFile(files, 'package.json');
  if (pkg.name !== '@iroha/iroha-js' || pkg.version !== '0.0.2') {
    fail(`unexpected package identity ${pkg.name ?? '<missing>'}@${pkg.version ?? '<missing>'}`);
  }
  if (pkg.type !== 'module' || pkg.license !== 'Apache-2.0' || pkg.private !== false) {
    fail('package module, license, or publication metadata is unexpected');
  }
  for (const [exportName, expected] of Object.entries(REQUIRED_EXPORTS)) {
    if (!isDeepStrictEqual(pkg.exports?.[exportName], expected)) {
      fail(`package export ${exportName} differs from the reviewed 0.0.2 surface`);
    }
  }
  for (const exportName of FORBIDDEN_EXPORTS) {
    if (Object.hasOwn(pkg.exports ?? {}, exportName)) {
      fail(`blocked-send package unexpectedly exposes ${exportName}`);
    }
  }
  if (
    !isDeepStrictEqual(pkg.browser, {
      './dist/crypto.js': './dist/crypto.browser.js',
      './dist/native.js': './dist/native.browser.js',
    })
  ) {
    fail('package browser remapping differs from the reviewed fail-closed mapping');
  }

  const nativeBrowser = files.get('dist/native.browser.js')?.toString('utf8');
  if (!nativeBrowser?.includes(BROWSER_NATIVE_FAILURE)) {
    fail('browser native shim is missing the reviewed fail-closed error');
  }
}

async function collectInstalledFiles(packageDirectory) {
  const rootStat = await fs.lstat(packageDirectory).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    fail(`installed package is missing or is not a regular directory: ${packageDirectory}`);
  }

  const files = new Map();
  async function visit(directory, prefix = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`installed package contains a symlink: ${relativePath}`);
      if (entry.isDirectory()) await visit(fullPath, relativePath);
      else if (entry.isFile()) files.set(relativePath, await fs.readFile(fullPath));
      else fail(`installed package contains a special file: ${relativePath}`);
    }
  }
  await visit(packageDirectory);
  return files;
}

function compareInstalledPackage(archiveFiles, installedFiles) {
  const archivePaths = [...archiveFiles.keys()].sort();
  const installedPaths = [...installedFiles.keys()].sort();
  if (!isDeepStrictEqual(installedPaths, archivePaths)) {
    fail('installed package file inventory differs from the reviewed vendored archive');
  }
  for (const relativePath of archivePaths) {
    if (!archiveFiles.get(relativePath).equals(installedFiles.get(relativePath))) {
      fail(`installed package differs from the reviewed vendored archive: ${relativePath}`);
    }
  }
}

export async function auditVendoredIrohaJsSdk({ auditRoot = rootDir } = {}) {
  const archivePath = path.join(auditRoot, VENDORED_IROHA_ARCHIVE);
  const archiveStat = await fs.lstat(archivePath).catch(() => null);
  if (!archiveStat?.isFile() || archiveStat.isSymbolicLink()) {
    fail(`vendored archive is missing or is not a regular file: ${archivePath}`);
  }
  if (archiveStat.size !== VENDORED_IROHA_ARCHIVE_BYTES) {
    fail(`vendored archive has ${archiveStat.size} bytes, expected ${VENDORED_IROHA_ARCHIVE_BYTES}`);
  }

  const compressedArchive = await fs.readFile(archivePath);
  const archiveSha256 = sha256(compressedArchive);
  if (archiveSha256 !== VENDORED_IROHA_ARCHIVE_SHA256) {
    fail(`vendored archive SHA-256 is ${archiveSha256}, expected ${VENDORED_IROHA_ARCHIVE_SHA256}`);
  }
  const archiveFiles = parseReviewedIrohaArchive(compressedArchive);
  validatePackageContents(archiveFiles);

  const rootPackage = JSON.parse(await fs.readFile(path.join(auditRoot, 'package.json'), 'utf8'));
  if (rootPackage.dependencies?.['@iroha/iroha-js'] !== VENDORED_IROHA_DEPENDENCY) {
    fail(`package.json must pin @iroha/iroha-js to ${VENDORED_IROHA_DEPENDENCY}`);
  }

  const installedDirectory = path.join(auditRoot, 'node_modules/@iroha/iroha-js');
  const installedFiles = await collectInstalledFiles(installedDirectory);
  compareInstalledPackage(archiveFiles, installedFiles);

  return {
    archiveBytes: compressedArchive.length,
    archiveFileCount: archiveFiles.size,
    archivePath,
    archiveSha256,
    dependency: VENDORED_IROHA_DEPENDENCY,
    installedFileCount: installedFiles.size,
    version: '0.0.2',
  };
}

async function main() {
  try {
    if (process.argv.length !== 2) fail('this audit accepts no path or digest overrides');
    const result = await auditVendoredIrohaJsSdk();
    console.log(
      `Vendored Iroha JS SDK audit passed: ${result.version}; ${result.archiveFileCount} files; ${result.archiveBytes} bytes; SHA-256 ${result.archiveSha256}; installed package matches exactly`
    );
  } catch (error) {
    console.error(`Vendored Iroha JS SDK audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
