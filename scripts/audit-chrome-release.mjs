#!/usr/bin/env node

import { createHash, createPublicKey } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, inflateSync } from 'node:zlib';

export const CURRENT_PUBLISHED_VERSION = '3.0.5';
export const EXPECTED_CHROME_EXTENSION_ID = 'nhlnehondigmgckngjomcpcefcdplmgc';
export const MINIMUM_SUPPORTED_CHROME_VERSION = '102';
const EXPECTED_EXTENSION_AUTHOR = 'Soramitsu';
const EXPECTED_EXTENSION_DESCRIPTION =
  'Non-custodial multichain wallet for Polkadot, Ethereum, TON, Bitcoin, Solana, and SORA ecosystems.';
const EXPECTED_EXTENSION_HOMEPAGE = 'https://fearlesswallet.io/';
const EXPECTED_EXTENSION_NAME = 'Fearless Wallet';
const EXPECTED_EXTENSION_SHORT_NAME = 'FW';
const EXPECTED_OAUTH_CLIENT_ID_SHA256 = '06863ed12787664ce1a3433d70d645b4d5fbc7e8dc72bec0f437e95d24edc69c';
export const REQUIRED_PUBLIC_CONFIG_KEYS = [
  'OAUTH_CLIENT_ID',
  'RAMP_TEST_API_KEY',
  'RAMP_PROD_API_KEY',
  'MOONPAY_TEST_API_KEY',
  'MOONPAY_PROD_API_KEY',
  'VUE_APP_FL_WEB_X1_TESTNET_API_KEY',
  'FL_WEB_TON_API_KEY',
  'FL_WEB_ARBISCAN_API_KEY',
  'FL_WEB_ETHERSCAN_API_KEY',
  'FL_WEB_BSCSCAN_API_KEY',
  'FL_WEB_POLYGONSCAN_API_KEY',
  'FL_BLAST_API_ETHEREUM_KEY',
  'FL_BLAST_API_BSC_KEY',
  'FL_BLAST_API_SEPOLIA_KEY',
  'FL_BLAST_API_GOERLI_KEY',
  'FL_BLAST_API_POLYGON_KEY',
  'FL_WEB_ALCHEMY_API_ETHEREUM_KEY',
  'FL_BLAST_API_MOONBEAM_KEY',
  'FL_BLAST_API_MOONRIVER_KEY',
  'FL_BLAST_API_OKTC_MAINNET_KEY',
  'FL_BLAST_API_OPTIMISM_MAINNET_KEY',
  'FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY',
  'FL_WEB_SNOWTRACE_API_KEY',
  'FL_WEB_ZKEVM_POLYGONSCAN_API_KEY',
  'FL_DWELLIR_API_KEY',
];
export const REQUIRED_COMPILED_PUBLIC_CONFIG_KEYS = REQUIRED_PUBLIC_CONFIG_KEYS.filter(
  (key) =>
    key !== 'RAMP_TEST_API_KEY' && key !== 'MOONPAY_TEST_API_KEY' && key !== 'FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY'
);

const DEFAULT_ARCHIVE_NAME = 'fearless-wallet-extension-chrome.zip';
const REQUIRED_ICON_SIZES = ['16', '32', '48', '64', '128'];
const EXPECTED_PERMISSIONS = ['storage', 'tabs', 'identity', 'clipboardRead', 'alarms'];
const EXPECTED_HOST_PERMISSIONS = ['<all_urls>'];
const EXPECTED_CONTENT_SCRIPT_MATCHES = ['https://*/*', 'http://*/*'];
const EXPECTED_WEB_RESOURCE_MATCHES = ['https://*/*', 'http://*/*', 'http://localhost/*'];
const EXPECTED_EXTENSION_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; style-src 'unsafe-inline'; img-src 'self' https: data:; frame-src https:; frame-ancestors https:; connect-src https: wss: ws:; media-src https:";
const EXPECTED_RELEASE_FLAGS = {
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'false',
  VUE_APP_TEST_ONLY: 'false',
};
const REQUIRED_MANIFEST_KEYS = [
  'action',
  'author',
  'background',
  'content_scripts',
  'content_security_policy',
  'description',
  'homepage_url',
  'host_permissions',
  'icons',
  'manifest_version',
  'minimum_chrome_version',
  'name',
  'permissions',
  'short_name',
  'version',
  'web_accessible_resources',
];
const OPTIONAL_MANIFEST_KEYS = ['key', 'oauth2'];
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC32_TABLE = makeCrc32Table();

export class ChromeReleaseAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChromeReleaseAuditError';
  }
}

function fail(message) {
  throw new ChromeReleaseAuditError(message);
}

function requireCondition(condition, message) {
  if (!condition) fail(message);
}

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateExactStringSet(value, expected, label) {
  requireCondition(Array.isArray(value), `${label} must be an array`);
  requireCondition(
    value.every((entry) => typeof entry === 'string'),
    `${label} must contain only strings`
  );
  requireCondition(new Set(value).size === value.length, `${label} must not contain duplicates`);

  const actualSet = new Set(value);
  const expectedSet = new Set(expected);
  const missing = expected.filter((entry) => !actualSet.has(entry));
  const extra = value.filter((entry) => !expectedSet.has(entry));
  requireCondition(
    missing.length === 0 && extra.length === 0,
    `${label} differs from the reviewed allowlist; missing ${JSON.stringify(missing)}; extra ${JSON.stringify(extra)}`
  );
}

function validateExactObjectKeys(value, expected, label) {
  requireCondition(isPlainObject(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  requireCondition(
    actual.length === wanted.length && actual.every((key, index) => key === wanted[index]),
    `${label} keys differ from the reviewed allowlist; expected ${JSON.stringify(wanted)}, received ${JSON.stringify(actual)}`
  );
}

function validateObjectKeyAllowlist(value, required, optional, label) {
  requireCondition(isPlainObject(value), `${label} must be an object`);
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const extra = keys.filter((key) => !allowed.has(key));
  requireCondition(
    missing.length === 0 && extra.length === 0,
    `${label} keys differ from the reviewed allowlist; missing ${JSON.stringify(missing)}; extra ${JSON.stringify(extra)}`
  );
}

function parseJson(bytes, label) {
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
  requireCondition(isPlainObject(parsed), `${label} must contain a JSON object`);
  return parsed;
}

function parseChromeVersion(value, label) {
  requireCondition(typeof value === 'string', `${label} must be a string`);
  requireCondition(
    /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/u.test(value),
    `${label} must use Chrome's one-to-four-component numeric version syntax`
  );
  const components = value.split('.').map(Number);
  requireCondition(
    components.every((component) => component <= 65535),
    `${label} components must not exceed 65535`
  );
  requireCondition(
    components.some((component) => component !== 0),
    `${label} must not be all zeroes`
  );
  return components;
}

function compareVersionComponents(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function normalizedManifestResource(value, label) {
  requireCondition(typeof value === 'string' && value.length > 0, `${label} must name a file`);
  const resource = value.split(/[?#]/u, 1)[0];
  requireCondition(resource.length > 0, `${label} must name a file before any query or fragment`);
  validateSafeRelativePath(resource, label, false);
  return resource;
}

function resolveRuntimeJavaScriptResource(specifier, importer, label) {
  requireCondition(typeof specifier === 'string' && specifier.length > 0, `${label} has an empty module specifier`);
  requireCondition(
    specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/'),
    `${label} must use a local JavaScript module specifier`
  );
  const resourceWithoutFragment = specifier.split(/[?#]/u, 1)[0];
  const resource = specifier.startsWith('/')
    ? resourceWithoutFragment.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(importer), resourceWithoutFragment));
  validateSafeRelativePath(resource, label, false);
  requireCondition(resource.endsWith('.js'), `${label} must resolve to JavaScript`);
  return resource;
}

function popupJavaScriptReferences(content, label) {
  const references = [];
  const html = content.toString('utf8');
  const referencePattern = /<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+\.js(?:[?#][^"']*)?)["'][^>]*>/giu;
  for (const match of html.matchAll(referencePattern)) {
    references.push(resolveRuntimeJavaScriptResource(match[1], 'popup.html', `${label} JavaScript reference`));
  }
  requireCondition(references.length > 0, `${label} must reference at least one local JavaScript module`);
  return references;
}

function reviewedRuntimeJavaScript(files, manifest, label) {
  const resources = [
    manifest.background.service_worker,
    ...manifest.content_scripts.flatMap((entry) => entry.js),
    ...manifest.web_accessible_resources.flatMap((entry) =>
      entry.resources.filter((resource) => resource.endsWith('.js'))
    ),
    ...popupJavaScriptReferences(files.get('popup.html'), `${label} popup.html`),
  ];
  const reviewed = new Set();

  for (const resource of resources) {
    validateSafeRelativePath(resource, `${label} reviewed JavaScript`, false);
    requireCondition(resource.endsWith('.js'), `${label} reviewed runtime resource ${resource} must be JavaScript`);
    requireCondition(files.has(resource), `${label} references missing reviewed JavaScript ${resource}`);
    reviewed.add(resource);
  }

  return [...reviewed].map((name) => [name, files.get(name)]);
}

function validateSafeRelativePath(value, label, allowDirectory) {
  requireCondition(typeof value === 'string' && value.length > 0, `${label} has an empty path`);
  requireCondition(!value.includes('\0'), `${label} contains a NUL byte`);
  requireCondition(!/[\u0000-\u001f\u007f]/u.test(value), `${label} contains a control character`);
  requireCondition(!value.includes('\\'), `${label} uses a backslash path separator`);
  requireCondition(!value.startsWith('/'), `${label} is absolute`);
  requireCondition(!/^[A-Za-z]:/u.test(value), `${label} uses a drive-qualified path`);

  const isDirectory = value.endsWith('/');
  requireCondition(allowDirectory || !isDirectory, `${label} unexpectedly names a directory`);
  const withoutSlash = isDirectory ? value.slice(0, -1) : value;
  const segments = withoutSlash.split('/');
  requireCondition(
    segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    `${label} traverses or has an empty path segment`
  );
  requireCondition(path.posix.normalize(withoutSlash) === withoutSlash, `${label} is not a normalized relative path`);

  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const junkSegment = lowerSegments.find(
    (segment) =>
      segment === '__macosx' ||
      segment === '.ds_store' ||
      segment === 'thumbs.db' ||
      segment === 'desktop.ini' ||
      segment === '.git' ||
      segment === '.svn' ||
      segment === '.hg' ||
      segment.startsWith('._')
  );
  requireCondition(!junkSegment, `${label} contains archive junk (${junkSegment})`);
  requireCondition(
    !/(?:\.zip|\.crx|\.xpi|\.7z|\.rar|\.tar|\.tgz|\.tar\.gz|\.tar\.bz2|\.tar\.xz)$/iu.test(withoutSlash),
    `${label} contains a nested or self archive`
  );
  requireCondition(
    !/(^|[/_.-])smoke[-_.]?control([/_.-]|$)/iu.test(withoutSlash),
    `${label} contains smoke-control output`
  );
  requireCondition(!/\.map$/iu.test(withoutSlash), `${label} contains a source map`);

  return { isDirectory, normalized: withoutSlash };
}

function decodeZipName(bytes, flags, label) {
  if ((flags & 0x0800) === 0) {
    requireCondition(
      bytes.every((byte) => byte >= 0x20 && byte <= 0x7e),
      `${label} has a non-ASCII name without the ZIP UTF-8 flag`
    );
    return bytes.toString('ascii');
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} has an invalid UTF-8 name`);
  }
}

function findEndOfCentralDirectory(archive) {
  const signature = 0x06054b50;
  const minimumOffset = Math.max(0, archive.length - 22 - 0xffff);

  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) !== signature) continue;
    const commentLength = archive.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === archive.length) return offset;
  }

  fail('ZIP has no valid end-of-central-directory record or has trailing junk');
}

export function readZipEntries(archive, archiveLabel) {
  requireCondition(archive.length >= 22, `${archiveLabel} is too short to be a ZIP`);
  const eocdOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(eocdOffset + 4);
  const centralDisk = archive.readUInt16LE(eocdOffset + 6);
  const diskEntryCount = archive.readUInt16LE(eocdOffset + 8);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);

  requireCondition(
    diskNumber === 0 && centralDisk === 0 && diskEntryCount === entryCount,
    `${archiveLabel} must be a single-disk ZIP`
  );
  requireCondition(
    entryCount !== 0xffff && centralSize !== 0xffffffff && centralOffset !== 0xffffffff,
    `${archiveLabel} uses unsupported ZIP64 metadata`
  );
  requireCondition(
    centralOffset + centralSize === eocdOffset,
    `${archiveLabel} has junk outside its local entries and central directory`
  );

  let offset = centralOffset;
  let totalUncompressed = 0;
  const records = [];
  const exactNames = new Set();
  const foldedNames = new Set();

  for (let index = 0; index < entryCount; index += 1) {
    requireCondition(
      offset + 46 <= eocdOffset && archive.readUInt32LE(offset) === 0x02014b50,
      `${archiveLabel} has a malformed central-directory entry`
    );
    const versionMadeBy = archive.readUInt16LE(offset + 4);
    const flags = archive.readUInt16LE(offset + 8);
    const method = archive.readUInt16LE(offset + 10);
    const expectedCrc = archive.readUInt32LE(offset + 16);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const startDisk = archive.readUInt16LE(offset + 34);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;

    requireCondition(end <= eocdOffset, `${archiveLabel} has a truncated central-directory entry`);
    requireCondition(startDisk === 0, `${archiveLabel} has a cross-disk entry`);
    requireCondition((flags & 0x2041) === 0, `${archiveLabel} contains an encrypted or masked entry`);
    requireCondition(method === 0 || method === 8, `${archiveLabel} uses unsupported compression method ${method}`);
    requireCondition(
      compressedSize !== 0xffffffff && uncompressedSize !== 0xffffffff && localOffset !== 0xffffffff,
      `${archiveLabel} uses an unsupported ZIP64 entry`
    );
    requireCondition(uncompressedSize <= MAX_ENTRY_BYTES, `${archiveLabel} contains an oversized entry`);
    totalUncompressed += uncompressedSize;
    requireCondition(
      totalUncompressed <= MAX_ARCHIVE_UNCOMPRESSED_BYTES,
      `${archiveLabel} expands beyond the audit size limit`
    );

    const rawName = archive.subarray(offset + 46, offset + 46 + nameLength);
    const name = decodeZipName(rawName, flags, `${archiveLabel} entry ${index + 1}`);
    const { isDirectory, normalized } = validateSafeRelativePath(
      name,
      `${archiveLabel} entry ${JSON.stringify(name)}`,
      true
    );
    const identity = normalized + (isDirectory ? '/' : '');
    requireCondition(!exactNames.has(identity), `${archiveLabel} contains duplicate entry ${JSON.stringify(identity)}`);
    requireCondition(
      !foldedNames.has(identity.toLowerCase()),
      `${archiveLabel} contains case-colliding entry ${JSON.stringify(identity)}`
    );
    exactNames.add(identity);
    foldedNames.add(identity.toLowerCase());

    const hostSystem = versionMadeBy >>> 8;
    if (hostSystem === 3 || hostSystem === 19) {
      const modeType = (externalAttributes >>> 16) & 0o170000;
      requireCondition(modeType !== 0o120000, `${archiveLabel} entry ${JSON.stringify(name)} is a symbolic link`);
      requireCondition(
        modeType === 0 || modeType === 0o100000 || modeType === 0o040000,
        `${archiveLabel} entry ${JSON.stringify(name)} has an unsupported filesystem type`
      );
      requireCondition(
        modeType !== 0o040000 || isDirectory,
        `${archiveLabel} entry ${JSON.stringify(name)} hides a directory behind a file name`
      );
    }

    if (isDirectory) {
      requireCondition(
        uncompressedSize === 0 &&
          expectedCrc === 0 &&
          ((method === 0 && compressedSize === 0) || (method === 8 && compressedSize === 2)),
        `${archiveLabel} directory ${JSON.stringify(name)} contains data`
      );
    }

    records.push({
      compressedSize,
      expectedCrc,
      flags,
      isDirectory,
      localOffset,
      method,
      name: normalized,
      rawName: Buffer.from(rawName),
      uncompressedSize,
    });
    offset = end;
  }

  requireCondition(offset === eocdOffset, `${archiveLabel} central-directory size does not match its entries`);
  requireCondition(records.length > 0, `${archiveLabel} is empty`);

  const localRanges = [];
  const files = new Map();
  for (const record of records) {
    requireCondition(
      record.localOffset + 30 <= centralOffset,
      `${archiveLabel} entry ${JSON.stringify(record.name)} has an invalid local-header offset`
    );
    requireCondition(
      archive.readUInt32LE(record.localOffset) === 0x04034b50,
      `${archiveLabel} entry ${JSON.stringify(record.name)} has no matching local header`
    );
    const localFlags = archive.readUInt16LE(record.localOffset + 6);
    const localMethod = archive.readUInt16LE(record.localOffset + 8);
    const localCrc = archive.readUInt32LE(record.localOffset + 14);
    const localCompressedSize = archive.readUInt32LE(record.localOffset + 18);
    const localUncompressedSize = archive.readUInt32LE(record.localOffset + 22);
    const localNameLength = archive.readUInt16LE(record.localOffset + 26);
    const localExtraLength = archive.readUInt16LE(record.localOffset + 28);
    const localNameStart = record.localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    const dataEnd = dataStart + record.compressedSize;

    requireCondition(
      localFlags === record.flags && localMethod === record.method,
      `${archiveLabel} entry ${JSON.stringify(record.name)} disagrees with its local header`
    );
    requireCondition(
      dataEnd <= centralOffset,
      `${archiveLabel} entry ${JSON.stringify(record.name)} has truncated compressed data`
    );
    requireCondition(
      archive.subarray(localNameStart, localNameStart + localNameLength).equals(record.rawName),
      `${archiveLabel} entry ${JSON.stringify(record.name)} has a mismatched local name`
    );
    let localEnd = dataEnd;
    if ((record.flags & 0x0008) !== 0) {
      requireCondition(
        dataEnd + 12 <= centralOffset,
        `${archiveLabel} entry ${JSON.stringify(record.name)} has a truncated data descriptor`
      );
      const hasSignature = archive.readUInt32LE(dataEnd) === 0x08074b50;
      const descriptorOffset = dataEnd + (hasSignature ? 4 : 0);
      requireCondition(
        descriptorOffset + 12 <= centralOffset,
        `${archiveLabel} entry ${JSON.stringify(record.name)} has a truncated data descriptor`
      );
      requireCondition(
        archive.readUInt32LE(descriptorOffset) === record.expectedCrc &&
          archive.readUInt32LE(descriptorOffset + 4) === record.compressedSize &&
          archive.readUInt32LE(descriptorOffset + 8) === record.uncompressedSize,
        `${archiveLabel} entry ${JSON.stringify(record.name)} has a mismatched data descriptor`
      );
      localEnd = descriptorOffset + 12;
    } else {
      requireCondition(
        localCrc === record.expectedCrc &&
          localCompressedSize === record.compressedSize &&
          localUncompressedSize === record.uncompressedSize,
        `${archiveLabel} entry ${JSON.stringify(record.name)} disagrees with its local size or CRC metadata`
      );
    }
    localRanges.push([record.localOffset, localEnd, record.name]);

    const compressed = archive.subarray(dataStart, dataEnd);
    let content;
    try {
      content =
        record.method === 0
          ? Buffer.from(compressed)
          : inflateRawSync(compressed, { maxOutputLength: Math.max(1, record.uncompressedSize) });
    } catch (error) {
      fail(`${archiveLabel} entry ${JSON.stringify(record.name)} cannot be decompressed: ${error.message}`);
    }
    requireCondition(
      content.length === record.uncompressedSize,
      `${archiveLabel} entry ${JSON.stringify(record.name)} has a false uncompressed size`
    );
    requireCondition(
      crc32(content) === record.expectedCrc,
      `${archiveLabel} entry ${JSON.stringify(record.name)} fails its CRC-32 check`
    );
    if (record.isDirectory) continue;
    files.set(record.name, content);
  }

  localRanges.sort((left, right) => left[0] - right[0]);
  requireCondition(localRanges[0][0] === 0, `${archiveLabel} has prepended archive junk`);
  for (let index = 1; index < localRanges.length; index += 1) {
    requireCondition(
      localRanges[index][0] === localRanges[index - 1][1],
      `${archiveLabel} has overlapping local entries or junk between entries`
    );
  }
  requireCondition(
    localRanges.at(-1)[1] === centralOffset,
    `${archiveLabel} has junk between its local entries and central directory`
  );

  requireCondition(
    files.has('manifest.json'),
    `${archiveLabel} must contain manifest.json at the archive root (wrapper directories are forbidden)`
  );
  for (const name of files.keys()) {
    requireCondition(
      name === 'manifest.json' || !name.endsWith('/manifest.json'),
      `${archiveLabel} contains a nested wrapper manifest ${JSON.stringify(name)}`
    );
  }
  return files;
}

async function readDirectoryArtifact(distDir, zipPath) {
  const files = new Map();
  const foldedNames = new Set();
  const resolvedZip = path.resolve(zipPath);

  async function visit(directory, relativeDirectory = '') {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      fail(`cannot read Chrome artifact directory ${directory}: ${error.message}`);
    }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));

    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (path.resolve(absolute) === resolvedZip) continue;
      validateSafeRelativePath(relative, `Chrome artifact path ${JSON.stringify(relative)}`, entry.isDirectory());
      requireCondition(!entry.isSymbolicLink(), `Chrome artifact path ${JSON.stringify(relative)} is a symbolic link`);
      requireCondition(
        entry.isDirectory() || entry.isFile(),
        `Chrome artifact path ${JSON.stringify(relative)} is not a regular file or directory`
      );
      if (entry.isDirectory()) await visit(absolute, relative);
      else {
        requireCondition(
          !foldedNames.has(relative.toLowerCase()),
          `Chrome artifact contains a case-colliding path ${JSON.stringify(relative)}`
        );
        foldedNames.add(relative.toLowerCase());
        files.set(relative, await fs.readFile(absolute));
      }
    }
  }

  await visit(distDir);
  requireCondition(files.size > 0, `Chrome artifact directory ${distDir} is empty`);
  return files;
}

function validatePngIcon(bytes, size, label) {
  requireCondition(bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE), `${label} is not a PNG`);

  let ihdr;
  const idatChunks = [];
  let offset = PNG_SIGNATURE.length;
  let sawIend = false;

  while (offset < bytes.length) {
    requireCondition(bytes.length - offset >= 12, `${label} has a truncated PNG chunk header`);
    const chunkLength = bytes.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + 4;

    requireCondition(chunkEnd <= bytes.length, `${label} has a truncated PNG chunk`);
    const chunkType = bytes.toString('ascii', typeStart, dataStart);
    requireCondition(/^[A-Za-z]{4}$/u.test(chunkType), `${label} has an invalid PNG chunk type`);
    requireCondition(
      bytes.readUInt32BE(dataEnd) === crc32(bytes.subarray(typeStart, dataEnd)),
      `${label} has an invalid PNG ${chunkType} checksum`
    );

    if (offset === PNG_SIGNATURE.length) {
      requireCondition(chunkType === 'IHDR' && chunkLength === 13, `${label} has no valid PNG IHDR chunk`);
    }
    if (chunkType === 'IHDR') {
      requireCondition(ihdr === undefined && chunkLength === 13, `${label} has an invalid PNG IHDR chunk`);
      ihdr = bytes.subarray(dataStart, dataEnd);
      requireCondition(
        ihdr[10] === 0 && ihdr[11] === 0 && (ihdr[12] === 0 || ihdr[12] === 1),
        `${label} has unsupported PNG compression, filtering, or interlace metadata`
      );
    } else if (chunkType === 'IDAT') {
      idatChunks.push(bytes.subarray(dataStart, dataEnd));
    } else if (chunkType === 'IEND') {
      requireCondition(chunkLength === 0, `${label} has an invalid PNG IEND chunk`);
      requireCondition(chunkEnd === bytes.length, `${label} has bytes after the PNG IEND chunk`);
      sawIend = true;
    }

    offset = chunkEnd;
    if (sawIend) break;
  }

  requireCondition(ihdr !== undefined, `${label} has no PNG IHDR chunk`);
  requireCondition(idatChunks.length > 0, `${label} has no PNG image data`);
  requireCondition(sawIend, `${label} has no complete PNG IEND chunk`);
  requireCondition(
    ihdr.readUInt32BE(0) === Number(size) && ihdr.readUInt32BE(4) === Number(size),
    `${label} must be ${size}x${size} pixels`
  );

  try {
    inflateSync(Buffer.concat(idatChunks), { maxOutputLength: 4 * 1024 * 1024 });
  } catch (error) {
    fail(`${label} has invalid or oversized PNG image data: ${error.message}`);
  }
}

function validateNoProductionDebugOutput(files, label) {
  for (const [name, content] of files) {
    validateSafeRelativePath(name, `${label} path ${JSON.stringify(name)}`, false);
    if (/\.(?:js|mjs|cjs|css|html)$/iu.test(name)) {
      requireCondition(
        !/[@#]\s*sourceMappingURL\s*=/iu.test(content.toString('utf8')),
        `${label} file ${JSON.stringify(name)} embeds a source map reference`
      );
    }
  }
}

function validateManifest(
  manifest,
  packageJson,
  files,
  label,
  release,
  releaseEnvironment,
  expectedOAuthClientIdSha256
) {
  validateObjectKeyAllowlist(manifest, REQUIRED_MANIFEST_KEYS, OPTIONAL_MANIFEST_KEYS, `${label} top-level manifest`);
  requireCondition(manifest.manifest_version === 3, `${label} must use manifest_version 3`);
  const manifestVersion = parseChromeVersion(manifest.version, `${label} version`);
  const publishedVersion = parseChromeVersion(CURRENT_PUBLISHED_VERSION, 'published Chrome version');
  requireCondition(
    compareVersionComponents(manifestVersion, publishedVersion) > 0,
    `${label} version ${manifest.version} must be greater than published version ${CURRENT_PUBLISHED_VERSION}`
  );
  requireCondition(
    manifest.version === packageJson.version,
    `${label} version ${manifest.version} does not match package.json version ${packageJson.version}`
  );
  parseChromeVersion(manifest.minimum_chrome_version, `${label} minimum_chrome_version`);
  requireCondition(
    manifest.minimum_chrome_version === MINIMUM_SUPPORTED_CHROME_VERSION,
    `${label} minimum_chrome_version must equal the reviewed value ${MINIMUM_SUPPORTED_CHROME_VERSION}`
  );

  requireCondition(
    packageJson.description === EXPECTED_EXTENSION_DESCRIPTION && manifest.description === packageJson.description,
    `${label} description must equal the reviewed package description`
  );
  requireCondition(
    Array.from(manifest.description).length <= 132,
    `${label} description exceeds Chrome's 132-character limit`
  );
  validateExactObjectKeys(manifest.background, ['service_worker', 'type'], `${label} background`);
  requireCondition(manifest.name === EXPECTED_EXTENSION_NAME, `${label} name must be ${EXPECTED_EXTENSION_NAME}`);
  requireCondition(
    manifest.short_name === EXPECTED_EXTENSION_SHORT_NAME,
    `${label} short_name must be ${EXPECTED_EXTENSION_SHORT_NAME}`
  );
  requireCondition(
    manifest.author === EXPECTED_EXTENSION_AUTHOR,
    `${label} author must be ${EXPECTED_EXTENSION_AUTHOR}`
  );
  requireCondition(
    manifest.homepage_url === EXPECTED_EXTENSION_HOMEPAGE,
    `${label} homepage_url must be ${EXPECTED_EXTENSION_HOMEPAGE}`
  );
  requireCondition(
    manifest.background.service_worker === 'background.js',
    `${label} must use background.js as its MV3 service worker`
  );
  requireCondition(manifest.background.type === 'module', `${label} background service worker must use module type`);
  validateExactObjectKeys(manifest.action, ['default_popup', 'default_title'], `${label} action`);
  requireCondition(
    manifest.action.default_popup === 'popup.html#/',
    `${label} action.default_popup must equal popup.html#/`
  );
  requireCondition(
    manifest.action.default_title === 'Fearless Wallet',
    `${label} action.default_title must be Fearless Wallet`
  );
  validateExactObjectKeys(manifest.icons, REQUIRED_ICON_SIZES, `${label} icons`);

  validateExactStringSet(manifest.permissions, EXPECTED_PERMISSIONS, `${label} permissions`);
  validateExactStringSet(manifest.host_permissions, EXPECTED_HOST_PERMISSIONS, `${label} host_permissions`);
  requireCondition(!('optional_permissions' in manifest), `${label} must not request optional_permissions`);
  requireCondition(!('optional_host_permissions' in manifest), `${label} must not request optional_host_permissions`);

  validateExactObjectKeys(manifest.content_security_policy, ['extension_pages'], `${label} content_security_policy`);
  requireCondition(
    manifest.content_security_policy.extension_pages === EXPECTED_EXTENSION_CSP,
    `${label} extension page CSP differs from the reviewed policy`
  );

  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  requireCondition(contentScripts.length === 1, `${label} must define exactly one content script`);
  validateExactObjectKeys(contentScripts[0], ['js', 'matches', 'run_at'], `${label} content script`);
  validateExactStringSet(contentScripts[0].js, ['content.js'], `${label} content script JavaScript`);
  validateExactStringSet(contentScripts[0].matches, EXPECTED_CONTENT_SCRIPT_MATCHES, `${label} content script matches`);
  requireCondition(contentScripts[0].run_at === 'document_start', `${label} content script must run at document_start`);

  const webResources = Array.isArray(manifest.web_accessible_resources) ? manifest.web_accessible_resources : [];
  requireCondition(webResources.length === 1, `${label} must define exactly one web-accessible resource group`);
  validateExactObjectKeys(webResources[0], ['matches', 'resources'], `${label} web-accessible resource group`);
  validateExactStringSet(webResources[0].resources, ['page.js'], `${label} web-accessible resources`);
  validateExactStringSet(
    webResources[0].matches,
    EXPECTED_WEB_RESOURCE_MATCHES,
    `${label} web-accessible resource matches`
  );

  requireCondition(files.has('extension-build-metadata.json'), `${label} is missing extension-build-metadata.json`);
  const buildMetadata = parseJson(files.get('extension-build-metadata.json'), `${label} extension build metadata`);
  validateExactObjectKeys(
    buildMetadata,
    ['browser', 'mode', 'releaseFlags', 'schemaVersion'],
    `${label} extension build metadata`
  );
  requireCondition(buildMetadata.schemaVersion === 1, `${label} extension build metadata schemaVersion must be 1`);
  requireCondition(buildMetadata.browser === 'chrome', `${label} extension build metadata browser must be chrome`);
  requireCondition(buildMetadata.mode === 'production', `${label} extension build metadata mode must be production`);
  validateExactObjectKeys(
    buildMetadata.releaseFlags,
    Object.keys(EXPECTED_RELEASE_FLAGS),
    `${label} extension build release flags`
  );
  for (const [key, expected] of Object.entries(EXPECTED_RELEASE_FLAGS)) {
    requireCondition(
      buildMetadata.releaseFlags[key] === expected,
      `${label} extension build release flag ${key} must be ${expected}`
    );
  }

  for (const requiredFile of [
    'manifest.json',
    'extension-build-metadata.json',
    'background.js',
    'content.js',
    'page.js',
    'popup.html',
  ]) {
    requireCondition(files.has(requiredFile), `${label} is missing required file ${requiredFile}`);
  }
  requireCondition(isPlainObject(manifest.icons), `${label} icons must be an object`);
  for (const size of REQUIRED_ICON_SIZES) {
    const iconPath = normalizedManifestResource(manifest.icons[size], `${label} icons.${size}`);
    requireCondition(files.has(iconPath), `${label} is missing ${size}px icon ${iconPath}`);
    validatePngIcon(files.get(iconPath), size, `${label} icon ${iconPath}`);
  }

  const referencedResources = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...contentScripts.flatMap((entry) => [
      ...(Array.isArray(entry?.js) ? entry.js : []),
      ...(Array.isArray(entry?.css) ? entry.css : []),
    ]),
    ...webResources.flatMap((entry) => (Array.isArray(entry?.resources) ? entry.resources : [])),
  ];
  for (const [index, resourceValue] of referencedResources.entries()) {
    if (typeof resourceValue === 'string' && /[*]/u.test(resourceValue)) continue;
    const resource = normalizedManifestResource(resourceValue, `${label} referenced resource ${index + 1}`);
    requireCondition(files.has(resource), `${label} references missing file ${resource}`);
  }

  let extensionId;
  if (manifest.oauth2 !== undefined) {
    validateExactObjectKeys(manifest.oauth2, ['client_id', 'scopes'], `${label} oauth2`);
  }
  if (release) {
    requireCondition(
      typeof manifest.key === 'string' && manifest.key.trim().length > 0,
      `${label} release mode requires manifest key`
    );
    requireCondition(isPlainObject(manifest.oauth2), `${label} release mode requires manifest oauth2 configuration`);
    requireCondition(
      typeof manifest.oauth2.client_id === 'string' &&
        /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\.apps\.googleusercontent\.com$/u.test(manifest.oauth2.client_id),
      `${label} release mode requires a Google OAuth client_id ending in .apps.googleusercontent.com`
    );
    requireCondition(
      Array.isArray(manifest.oauth2.scopes) &&
        manifest.oauth2.scopes.length === 1 &&
        manifest.oauth2.scopes[0] === 'https://www.googleapis.com/auth/drive.appdata',
      `${label} release mode requires exactly the Google Drive appdata OAuth scope`
    );
    requireCondition(
      manifest.oauth2.client_id === releaseEnvironment.OAUTH_CLIENT_ID,
      `${label} release OAuth client_id does not match OAUTH_CLIENT_ID`
    );
    requireCondition(
      createHash('sha256').update(manifest.oauth2.client_id).digest('hex') === expectedOAuthClientIdSha256,
      `${label} release OAuth client_id does not match the reviewed published client`
    );
    const runtimeJavaScript = reviewedRuntimeJavaScript(files, manifest, label);
    requireCondition(
      runtimeJavaScript.some(
        ([name, content]) => name.endsWith('.js') && content.includes(Buffer.from(manifest.oauth2.client_id))
      ),
      `${label} release OAuth client_id is not compiled into a reviewed entrypoint or popup preload`
    );
    for (const key of REQUIRED_COMPILED_PUBLIC_CONFIG_KEYS) {
      const value = releaseEnvironment[key];
      requireCondition(
        typeof value === 'string' && value.length > 0,
        `${label} release environment requires non-empty ${key}`
      );
      requireCondition(
        runtimeJavaScript.some(([name, content]) => name.endsWith('.js') && content.includes(Buffer.from(value))),
        `${label} release ${key} is not compiled into a reviewed entrypoint or popup preload`
      );
    }
    extensionId = deriveChromeExtensionId(manifest.key);
    requireCondition(
      extensionId === EXPECTED_CHROME_EXTENSION_ID,
      `${label} key derives Chrome extension ID ${extensionId}, expected ${EXPECTED_CHROME_EXTENSION_ID}`
    );
  }

  return extensionId;
}

function compareArtifacts(directoryFiles, zipFiles) {
  const directoryNames = [...directoryFiles.keys()].sort();
  const zipNames = [...zipFiles.keys()].sort();
  requireCondition(
    directoryNames.length === zipNames.length,
    `ZIP file count ${zipNames.length} does not match Chrome artifact file count ${directoryNames.length}`
  );
  for (let index = 0; index < directoryNames.length; index += 1) {
    requireCondition(
      directoryNames[index] === zipNames[index],
      `ZIP contents differ from Chrome artifact at ${directoryNames[index] ?? zipNames[index]}`
    );
    requireCondition(
      directoryFiles.get(directoryNames[index]).equals(zipFiles.get(zipNames[index])),
      `ZIP file ${JSON.stringify(zipNames[index])} is not byte-for-byte identical to the Chrome artifact`
    );
  }
}

export function deriveChromeExtensionId(manifestKey) {
  requireCondition(typeof manifestKey === 'string', 'manifest key must be a base64 string');
  const compact = manifestKey.replace(/\s+/gu, '');
  requireCondition(compact.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/u.test(compact), 'manifest key is not valid base64');
  let der;
  try {
    der = Buffer.from(compact, 'base64');
  } catch {
    fail('manifest key is not valid base64');
  }
  requireCondition(
    der.toString('base64').replace(/=+$/u, '') === compact.replace(/=+$/u, ''),
    'manifest key is not canonical base64'
  );

  let publicKey;
  try {
    publicKey = createPublicKey({ format: 'der', key: der, type: 'spki' });
  } catch (error) {
    fail(`manifest key is not a DER SubjectPublicKeyInfo public key: ${error.message}`);
  }
  requireCondition(publicKey.asymmetricKeyType === 'rsa', 'manifest key must contain an RSA public key');
  const canonicalDer = publicKey.export({ format: 'der', type: 'spki' });
  requireCondition(canonicalDer.equals(der), 'manifest key DER is not canonical or has trailing data');

  const prefix = createHash('sha256').update(der).digest().subarray(0, 16);
  return [...prefix]
    .flatMap((byte) => [byte >>> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode('a'.charCodeAt(0) + nibble))
    .join('');
}

export async function auditChromeRelease({
  release = false,
  releaseEnvironment = process.env,
  expectedOAuthClientIdSha256 = EXPECTED_OAUTH_CLIENT_ID_SHA256,
  rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  distDir = path.join(rootDir, 'dist/extension/chrome'),
  zipPath = path.join(distDir, DEFAULT_ARCHIVE_NAME),
} = {}) {
  rootDir = path.resolve(rootDir);
  distDir = path.resolve(distDir);
  zipPath = path.resolve(zipPath);

  let packageBytes;
  try {
    packageBytes = await fs.readFile(path.join(rootDir, 'package.json'));
  } catch (error) {
    fail(`cannot read package.json: ${error.message}`);
  }
  const packageJson = parseJson(packageBytes, 'package.json');
  parseChromeVersion(packageJson.version, 'package.json version');

  const directoryFiles = await readDirectoryArtifact(distDir, zipPath);
  requireCondition(directoryFiles.has('manifest.json'), `${distDir} has no root manifest.json`);
  const directoryManifest = parseJson(directoryFiles.get('manifest.json'), 'Chrome directory manifest.json');

  let archive;
  try {
    archive = await fs.readFile(zipPath);
  } catch (error) {
    fail(`cannot read Chrome ZIP ${zipPath}: ${error.message}`);
  }
  const zipFiles = readZipEntries(archive, 'Chrome release ZIP');
  const zipManifest = parseJson(zipFiles.get('manifest.json'), 'Chrome ZIP manifest.json');

  validateNoProductionDebugOutput(directoryFiles, 'Chrome directory artifact');
  validateNoProductionDebugOutput(zipFiles, 'Chrome ZIP artifact');
  const directoryExtensionId = validateManifest(
    directoryManifest,
    packageJson,
    directoryFiles,
    'Chrome directory manifest',
    release,
    releaseEnvironment,
    expectedOAuthClientIdSha256
  );
  const zipExtensionId = validateManifest(
    zipManifest,
    packageJson,
    zipFiles,
    'Chrome ZIP manifest',
    release,
    releaseEnvironment,
    expectedOAuthClientIdSha256
  );
  compareArtifacts(directoryFiles, zipFiles);
  requireCondition(
    directoryExtensionId === zipExtensionId,
    'directory and ZIP manifests derive different extension IDs'
  );

  return {
    archiveBytes: archive.length,
    extensionId: directoryExtensionId,
    fileCount: directoryFiles.size,
    release,
    version: directoryManifest.version,
    zipSha256: createHash('sha256').update(archive).digest('hex'),
    zipPath,
  };
}

function usage() {
  return `Usage: node scripts/audit-chrome-release.mjs [--release] [--root DIR] [--dist DIR] [--zip FILE]

Audits dist/extension/chrome and fearless-wallet-extension-chrome.zip as a Chrome Web Store release package.
--release additionally requires the production manifest key and OAuth client ID and verifies the stable extension ID.`;
}

function parseArguments(argv) {
  let release = false;
  let rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let distDir;
  let zipPath;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--release') {
      release = true;
      continue;
    }
    if (argument === '--root' || argument === '--dist' || argument === '--zip') {
      const value = argv[index + 1];
      requireCondition(value && !value.startsWith('--'), `${argument} requires a path`);
      index += 1;
      if (argument === '--root') rootDir = path.resolve(value);
      else if (argument === '--dist') distDir = path.resolve(value);
      else zipPath = path.resolve(value);
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  distDir ??= path.join(rootDir, 'dist/extension/chrome');
  zipPath ??= path.join(distDir, DEFAULT_ARCHIVE_NAME);
  return { distDir, release, rootDir, zipPath };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await auditChromeRelease(options);
    const identity = result.release ? `; extension ID ${result.extensionId}` : '';
    console.log(
      `Chrome release audit passed: version ${result.version}; ${result.fileCount} files; ${result.archiveBytes} bytes; ZIP SHA-256 ${result.zipSha256}${identity}`
    );
  } catch (error) {
    console.error(`Chrome release audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
