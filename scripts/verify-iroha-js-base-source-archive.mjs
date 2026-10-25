#!/usr/bin/env node

import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { TextDecoder } from 'node:util';
import zlib from 'node:zlib';

const BLOCK_BYTES = 512;
const HARD_MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const HARD_MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const HARD_MAX_ENTRIES = 1024;
const HARD_MAX_FILE_BYTES = 8 * 1024 * 1024;
const HARD_MAX_INVENTORY_BYTES = 256 * 1024;
const METADATA_PATH = '.fearless-iroha-js-replay-base.json';
const INVENTORY_HEADER = '# fearless-iroha-js-candidate-replay-base-inventory-v1';
const CANONICAL_INCLUDED_PATHS = ['.gitignore', 'crates/iroha_js_host/src/lib.rs', 'javascript/iroha_js'];
const CANONICAL_EXCLUDED_PATHS = ['javascript/iroha_js/node_modules'];
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function parseArguments(argv) {
  const result = {
    manifest: '',
    extract: '',
    printInventory: false,
    archive: '',
    expectedCommit: '',
    expectedTree: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--print-inventory') {
      result.printInventory = true;
      continue;
    }
    const valueOptions = new Map([
      ['--manifest', 'manifest'],
      ['--extract', 'extract'],
      ['--archive', 'archive'],
      ['--expected-commit', 'expectedCommit'],
      ['--expected-tree', 'expectedTree'],
    ]);
    const property = valueOptions.get(argument);
    if (!property) fail(`unknown argument: ${argument}`);
    index += 1;
    if (index >= argv.length || argv[index].length === 0) fail(`${argument} requires a value`);
    result[property] = argv[index];
  }
  return result;
}

function readNullTerminatedString(buffer, offset, length, label) {
  const field = buffer.subarray(offset, offset + length);
  const zero = field.indexOf(0);
  const content = zero === -1 ? field : field.subarray(0, zero);
  if (zero !== -1) {
    assert(
      field.subarray(zero).every((byte) => byte === 0),
      `${label} contains bytes after its NUL terminator`
    );
  }
  try {
    return utf8Decoder.decode(content);
  } catch (error) {
    fail(`${label} is not valid UTF-8: ${error.message}`);
  }
}

function readOctal(buffer, offset, length, label) {
  const field = buffer.subarray(offset, offset + length);
  assert((field[0] & 0x80) === 0, `${label} uses a forbidden base-256 value`);
  const text = field
    .toString('ascii')
    .replace(/[\0 ]+$/u, '')
    .trimStart();
  assert(/^[0-7]+$/u.test(text), `${label} is not a canonical octal value`);
  const value = Number.parseInt(text, 8);
  assert(Number.isSafeInteger(value) && value >= 0, `${label} is outside the safe integer range`);
  return value;
}

function verifyHeaderChecksum(header, label) {
  const expected = readOctal(header, 148, 8, `${label} checksum`);
  let actual = 0;
  for (let index = 0; index < header.byteLength; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index];
  }
  assert(actual === expected, `${label} checksum mismatch`);
}

function parsePaxRecords(content, label) {
  const records = new Map();
  let offset = 0;
  while (offset < content.byteLength) {
    const space = content.indexOf(0x20, offset);
    assert(space > offset, `${label} contains a malformed record length`);
    const lengthText = content.subarray(offset, space).toString('ascii');
    assert(/^[1-9][0-9]*$/u.test(lengthText), `${label} contains a non-canonical record length`);
    const length = Number(lengthText);
    assert(Number.isSafeInteger(length) && length > space - offset + 3, `${label} record length is invalid`);
    const end = offset + length;
    assert(end <= content.byteLength && content[end - 1] === 0x0a, `${label} record is truncated`);
    let record;
    try {
      record = utf8Decoder.decode(content.subarray(space + 1, end - 1));
    } catch (error) {
      fail(`${label} record is not valid UTF-8: ${error.message}`);
    }
    const equals = record.indexOf('=');
    assert(equals > 0, `${label} record has no key`);
    const key = record.slice(0, equals);
    assert(!records.has(key), `${label} repeats key ${key}`);
    records.set(key, record.slice(equals + 1));
    offset = end;
  }
  assert(offset === content.byteLength, `${label} has trailing bytes`);
  return records;
}

function validatePath(archivePath, type) {
  assert(archivePath.length > 0, 'archive contains an empty path');
  assert(!archivePath.includes('\\'), `archive path contains a backslash: ${archivePath}`);
  assert(!archivePath.startsWith('/'), `archive path is absolute: ${archivePath}`);
  assert(
    ![...archivePath].some((character) => character.codePointAt(0) < 0x20 || character.codePointAt(0) === 0x7f),
    `archive path contains control bytes: ${JSON.stringify(archivePath)}`
  );
  assert(archivePath.normalize('NFC') === archivePath, `archive path is not NFC-normalized: ${archivePath}`);
  const isDirectory = type === 'D';
  assert(isDirectory === archivePath.endsWith('/'), `archive path/type slash mismatch: ${archivePath}`);
  const pathWithoutSlash = isDirectory ? archivePath.slice(0, -1) : archivePath;
  const components = pathWithoutSlash.split('/');
  assert(
    components.every((component) => component.length > 0 && component !== '.' && component !== '..'),
    `archive path contains an unsafe segment: ${archivePath}`
  );
  assert(path.posix.normalize(pathWithoutSlash) === pathWithoutSlash, `archive path is not normalized: ${archivePath}`);

  const allowed =
    archivePath === METADATA_PATH ||
    archivePath === '.gitignore' ||
    archivePath === 'crates/' ||
    archivePath === 'crates/iroha_js_host/' ||
    archivePath === 'crates/iroha_js_host/src/' ||
    archivePath === 'crates/iroha_js_host/src/lib.rs' ||
    archivePath === 'javascript/' ||
    archivePath === 'javascript/iroha_js/' ||
    (archivePath.startsWith('javascript/iroha_js/') &&
      archivePath !== 'javascript/iroha_js/node_modules/' &&
      !archivePath.startsWith('javascript/iroha_js/node_modules/'));
  assert(allowed, `archive path is outside the bounded replay scope: ${archivePath}`);
}

function inventoryText(entries) {
  const rows = entries.map((entry) => {
    const digest = entry.type === 'F' ? sha256(entry.content) : '-';
    return `${entry.type}\t${entry.mode.toString(8)}\t${entry.size}\t${digest}\t${entry.path}`;
  });
  return `${INVENTORY_HEADER}\n${rows.join('\n')}\n`;
}

function inspectArchive(compressedBytes, specification) {
  assert(
    compressedBytes.byteLength <= HARD_MAX_COMPRESSED_BYTES,
    'base source archive exceeds the hard compressed-size limit'
  );
  assert(
    compressedBytes.byteLength <= specification.maxCompressedBytes,
    'base source archive exceeds its manifest compressed-size limit'
  );

  let tarBytes;
  try {
    tarBytes = zlib.gunzipSync(compressedBytes, { maxOutputLength: specification.maxUncompressedBytes });
  } catch (error) {
    fail(`base source archive decompression failed or exceeded its bounded output: ${error.message}`);
  }
  assert(
    tarBytes.byteLength <= HARD_MAX_UNCOMPRESSED_BYTES,
    'base source archive exceeds the hard uncompressed-size limit'
  );
  assert(
    tarBytes.byteLength === specification.uncompressedBytes,
    'base source archive uncompressed byte count mismatch'
  );
  assert(tarBytes.byteLength % BLOCK_BYTES === 0, 'base source archive is not block-aligned');

  const entries = [];
  const paths = new Map();
  let offset = 0;
  let globalPaxHeaders = 0;
  let sourceCommit = '';
  let physicalHeaders = 0;
  let foundTerminator = false;
  let payloadBytes = 0;
  let regularFiles = 0;
  let directories = 0;

  while (offset + BLOCK_BYTES <= tarBytes.byteLength) {
    const header = tarBytes.subarray(offset, offset + BLOCK_BYTES);
    if (header.every((byte) => byte === 0)) {
      assert(
        offset + 2 * BLOCK_BYTES <= tarBytes.byteLength,
        'base source archive has only one terminating zero block'
      );
      assert(
        tarBytes.subarray(offset).every((byte) => byte === 0),
        'base source archive has non-zero trailing data'
      );
      foundTerminator = true;
      break;
    }

    physicalHeaders += 1;
    verifyHeaderChecksum(header, `tar header ${physicalHeaders}`);
    assert(
      header.subarray(257, 263).equals(Buffer.from('ustar\0', 'binary')),
      `tar header ${physicalHeaders} is not POSIX ustar`
    );
    assert(
      header.subarray(263, 265).equals(Buffer.from('00', 'ascii')),
      `tar header ${physicalHeaders} has an unsupported ustar version`
    );
    const name = readNullTerminatedString(header, 0, 100, `tar header ${physicalHeaders} name`);
    const prefix = readNullTerminatedString(header, 345, 155, `tar header ${physicalHeaders} prefix`);
    const archivePath = prefix.length > 0 ? `${prefix}/${name}` : name;
    const mode = readOctal(header, 100, 8, `tar header ${physicalHeaders} mode`);
    const size = readOctal(header, 124, 12, `tar header ${physicalHeaders} size`);
    const typeFlag = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const payloadOffset = offset + BLOCK_BYTES;
    const paddedSize = Math.ceil(size / BLOCK_BYTES) * BLOCK_BYTES;
    const nextOffset = payloadOffset + paddedSize;
    assert(nextOffset <= tarBytes.byteLength, `tar entry is truncated: ${archivePath}`);
    const content = tarBytes.subarray(payloadOffset, payloadOffset + size);

    if (typeFlag === 'g') {
      assert(physicalHeaders === 1, 'global PAX header must be the first physical header');
      assert(archivePath === 'pax_global_header', `unexpected global PAX header path: ${archivePath}`);
      assert(globalPaxHeaders === 0, 'base source archive contains multiple global PAX headers');
      const records = parsePaxRecords(content, 'global PAX header');
      assert(
        records.size === 1 && records.has('comment'),
        'global PAX header must contain only the source commit comment'
      );
      sourceCommit = records.get('comment');
      globalPaxHeaders += 1;
      offset = nextOffset;
      continue;
    }

    assert(typeFlag !== 'x', `per-entry PAX headers are forbidden: ${archivePath}`);
    assert(
      typeFlag === '0' || typeFlag === '5',
      `archive contains a link or special-file entry: ${archivePath} (type ${JSON.stringify(typeFlag)})`
    );
    const type = typeFlag === '5' ? 'D' : 'F';
    validatePath(archivePath, type);
    assert(!paths.has(archivePath), `archive contains a duplicate path: ${archivePath}`);
    assert(
      entries.length < specification.maxEntries && entries.length < HARD_MAX_ENTRIES,
      'base source archive exceeds its entry limit'
    );
    if (type === 'D') {
      assert(size === 0, `archive directory has a payload: ${archivePath}`);
      assert(mode === 0o775, `archive directory has an unexpected mode: ${archivePath}`);
      directories += 1;
    } else {
      assert(mode === 0o664 || mode === 0o775, `archive file has an unexpected mode: ${archivePath}`);
      assert(
        size <= specification.maxFileBytes && size <= HARD_MAX_FILE_BYTES,
        `archive file exceeds its per-file limit: ${archivePath}`
      );
      payloadBytes += size;
      regularFiles += 1;
    }

    const parent = path.posix.dirname(type === 'D' ? archivePath.slice(0, -1) : archivePath);
    if (parent !== '.') {
      const parentEntry = paths.get(`${parent}/`);
      assert(parentEntry?.type === 'D', `archive entry appears before or without its directory: ${archivePath}`);
    }
    const entry = { type, mode, size, path: archivePath, content };
    entries.push(entry);
    paths.set(archivePath, entry);
    offset = nextOffset;
  }

  assert(foundTerminator, 'base source archive has no two-block terminator');
  assert(globalPaxHeaders === 1, 'base source archive has no source-commit PAX header');
  assert(
    globalPaxHeaders === specification.globalPaxHeaders,
    `base source archive global-PAX count mismatch: expected ${specification.globalPaxHeaders}, got ${globalPaxHeaders}`
  );
  assert(
    physicalHeaders === specification.physicalHeaders,
    `base source archive physical-header count mismatch: expected ${specification.physicalHeaders}, got ${physicalHeaders}`
  );
  assert(
    sourceCommit === specification.sourceCommit,
    `base source archive commit mismatch: expected ${specification.sourceCommit}, got ${sourceCommit}`
  );
  assert(
    entries.length === specification.archiveEntries,
    `base source archive entry count mismatch: expected ${specification.archiveEntries}, got ${entries.length}`
  );
  assert(
    regularFiles === specification.regularFiles,
    `base source archive regular-file count mismatch: expected ${specification.regularFiles}, got ${regularFiles}`
  );
  assert(
    directories === specification.directories,
    `base source archive directory count mismatch: expected ${specification.directories}, got ${directories}`
  );
  if (specification.payloadBytes !== null) {
    assert(
      payloadBytes === specification.payloadBytes,
      `base source archive payload byte count mismatch: expected ${specification.payloadBytes}, got ${payloadBytes}`
    );
  }

  const metadataEntry = paths.get(METADATA_PATH);
  assert(metadataEntry?.type === 'F', `base source archive is missing ${METADATA_PATH}`);
  let metadata;
  try {
    metadata = JSON.parse(utf8Decoder.decode(metadataEntry.content));
  } catch (error) {
    fail(`base source archive metadata is invalid JSON: ${error.message}`);
  }
  const expectedMetadata = {
    schemaVersion: 1,
    kind: 'fearless-iroha-js-candidate-replay-base',
    baseCommit: specification.sourceCommit,
    baseTree: specification.sourceTree,
    fullRepository: false,
    includedPaths: CANONICAL_INCLUDED_PATHS,
    excludedPaths: CANONICAL_EXCLUDED_PATHS,
  };
  assert(
    JSON.stringify(metadata) === JSON.stringify(expectedMetadata),
    'base source archive commit/tree metadata mismatch'
  );

  return {
    entries,
    inventory: inventoryText(entries),
    metrics: {
      uncompressedBytes: tarBytes.byteLength,
      archiveEntries: entries.length,
      regularFiles,
      directories,
      payloadBytes,
      globalPaxHeaders,
      physicalHeaders,
    },
  };
}

function assertSafeBundleFile(bundleDirectory, filename, label) {
  assert(filename === path.basename(filename) && filename !== '.' && filename !== '..', `${label} filename is unsafe`);
  const absolute = path.join(bundleDirectory, filename);
  const stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
  assert(stat?.isFile() && !stat.isSymbolicLink(), `${label} is missing, non-regular, or symlinked: ${absolute}`);
  assert(fs.realpathSync(path.dirname(absolute)) === bundleDirectory, `${label} escapes its manifest directory`);
  return absolute;
}

function extractEntries(entries, destination) {
  const absolute = path.resolve(destination);
  assert(!fs.existsSync(absolute), `extraction destination already exists: ${absolute}`);
  const parent = path.dirname(absolute);
  const parentStat = fs.lstatSync(parent, { throwIfNoEntry: false });
  assert(
    parentStat?.isDirectory() && !parentStat.isSymbolicLink(),
    `extraction parent is missing or symlinked: ${parent}`
  );
  fs.mkdirSync(absolute, { mode: 0o700 });
  const extractionRoot = fs.realpathSync(absolute);
  for (const entry of entries) {
    const relative = entry.type === 'D' ? entry.path.slice(0, -1) : entry.path;
    const target = path.join(extractionRoot, ...relative.split('/'));
    assert(target.startsWith(`${extractionRoot}${path.sep}`), `extraction path escapes its root: ${entry.path}`);
    if (entry.type === 'D') {
      fs.mkdirSync(target, { mode: 0o700 });
      continue;
    }
    const parentReal = fs.realpathSync(path.dirname(target));
    assert(
      parentReal.startsWith(`${extractionRoot}${path.sep}`) || parentReal === extractionRoot,
      `extraction parent escapes its root: ${entry.path}`
    );
    const outputMode = (entry.mode & 0o111) === 0 ? 0o644 : 0o755;
    const descriptor = fs.openSync(
      target,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      outputMode
    );
    try {
      fs.writeFileSync(descriptor, entry.content);
      fs.fchmodSync(descriptor, outputMode);
    } finally {
      fs.closeSync(descriptor);
    }
  }
  for (const entry of [...entries].reverse()) {
    if (entry.type === 'D') fs.chmodSync(path.join(extractionRoot, ...entry.path.slice(0, -1).split('/')), 0o755);
  }
}

function readManifestSpecification(manifestPath) {
  const manifestAbsolute = path.resolve(manifestPath);
  const manifestStat = fs.lstatSync(manifestAbsolute, { throwIfNoEntry: false });
  assert(
    manifestStat?.isFile() && !manifestStat.isSymbolicLink(),
    `candidate manifest is missing, non-regular, or symlinked: ${manifestAbsolute}`
  );
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestAbsolute, 'utf8'));
  } catch (error) {
    fail(`candidate manifest is invalid JSON: ${error.message}`);
  }
  const baseArchive = manifest.source?.baseArchive;
  assert(
    baseArchive && typeof baseArchive === 'object' && !Array.isArray(baseArchive),
    'candidate manifest has no baseArchive object'
  );
  assert(baseArchive.format === 'git-archive-tar-gzip', 'baseArchive format is unexpected');
  assert(baseArchive.metadataPath === METADATA_PATH, 'baseArchive metadataPath is unexpected');
  assert(
    baseArchive.sourceCommit === manifest.source.baseCommit,
    'baseArchive sourceCommit differs from manifest baseCommit'
  );
  assert(baseArchive.sourceTree === manifest.source.baseTree, 'baseArchive sourceTree differs from manifest baseTree');
  assert(baseArchive.fullRepository === false, 'bounded base archive must not claim to contain the full repository');
  assert(
    JSON.stringify(baseArchive.includedPaths) === JSON.stringify(CANONICAL_INCLUDED_PATHS),
    'unexpected baseArchive included paths'
  );
  assert(
    JSON.stringify(baseArchive.excludedPaths) === JSON.stringify(CANONICAL_EXCLUDED_PATHS),
    'unexpected baseArchive excluded paths'
  );
  for (const [field, ceiling] of [
    ['bytes', HARD_MAX_COMPRESSED_BYTES],
    ['uncompressedBytes', HARD_MAX_UNCOMPRESSED_BYTES],
    ['archiveEntries', HARD_MAX_ENTRIES],
    ['regularFiles', HARD_MAX_ENTRIES],
    ['directories', HARD_MAX_ENTRIES],
    ['globalPaxHeaders', HARD_MAX_ENTRIES],
    ['physicalHeaders', HARD_MAX_ENTRIES],
    ['payloadBytes', HARD_MAX_UNCOMPRESSED_BYTES],
    ['maxCompressedBytes', HARD_MAX_COMPRESSED_BYTES],
    ['maxUncompressedBytes', HARD_MAX_UNCOMPRESSED_BYTES],
    ['maxEntries', HARD_MAX_ENTRIES],
    ['maxFileBytes', HARD_MAX_FILE_BYTES],
    ['inventoryBytes', HARD_MAX_INVENTORY_BYTES],
    ['inventoryEntries', HARD_MAX_ENTRIES],
  ]) {
    assert(
      Number.isSafeInteger(baseArchive[field]) && baseArchive[field] >= 0 && baseArchive[field] <= ceiling,
      `baseArchive ${field} is invalid or unbounded`
    );
  }
  assert(baseArchive.bytes <= baseArchive.maxCompressedBytes, 'baseArchive bytes exceed its declared bound');
  assert(
    baseArchive.uncompressedBytes <= baseArchive.maxUncompressedBytes,
    'baseArchive uncompressedBytes exceed its declared bound'
  );
  assert(baseArchive.archiveEntries <= baseArchive.maxEntries, 'baseArchive entries exceed its declared bound');
  assert(
    baseArchive.inventoryEntries === baseArchive.archiveEntries,
    'baseArchive inventory entry count differs from archiveEntries'
  );
  assert(/^[0-9a-f]{40}$/u.test(baseArchive.sourceCommit), 'baseArchive sourceCommit is invalid');
  assert(/^[0-9a-f]{40}$/u.test(baseArchive.sourceTree), 'baseArchive sourceTree is invalid');
  assert(/^[0-9a-f]{40}$/u.test(baseArchive.reconstructedSubsetTree), 'baseArchive reconstructedSubsetTree is invalid');
  assert(/^[0-9a-f]{64}$/u.test(baseArchive.sha256), 'baseArchive sha256 is invalid');
  assert(/^[0-9a-f]{64}$/u.test(baseArchive.inventorySha256), 'baseArchive inventorySha256 is invalid');

  const bundleDirectory = fs.realpathSync(path.dirname(manifestAbsolute));
  const archivePath = assertSafeBundleFile(bundleDirectory, baseArchive.file, 'base source archive');
  const inventoryPath = assertSafeBundleFile(bundleDirectory, baseArchive.inventoryFile, 'base source inventory');
  return { baseArchive, archivePath, inventoryPath };
}

function verifyFromManifest(options) {
  const { baseArchive, archivePath, inventoryPath } = readManifestSpecification(options.manifest);
  const archiveStat = fs.statSync(archivePath);
  assert(
    archiveStat.size === baseArchive.bytes,
    `base source archive byte count mismatch: expected ${baseArchive.bytes}, got ${archiveStat.size}`
  );
  const compressedBytes = fs.readFileSync(archivePath);
  assert(sha256(compressedBytes) === baseArchive.sha256, 'base source archive digest mismatch');

  const inventoryStat = fs.statSync(inventoryPath);
  assert(
    inventoryStat.size === baseArchive.inventoryBytes,
    `base source inventory byte count mismatch: expected ${baseArchive.inventoryBytes}, got ${inventoryStat.size}`
  );
  const expectedInventory = fs.readFileSync(inventoryPath);
  assert(expectedInventory.byteLength <= HARD_MAX_INVENTORY_BYTES, 'base source inventory exceeds its hard size limit');
  assert(sha256(expectedInventory) === baseArchive.inventorySha256, 'base source inventory digest mismatch');

  const inspected = inspectArchive(compressedBytes, baseArchive);
  const actualInventory = Buffer.from(inspected.inventory, 'utf8');
  assert(actualInventory.equals(expectedInventory), 'base source archive differs from its exact file inventory');
  if (options.extract) extractEntries(inspected.entries, options.extract);
  process.stdout.write(
    `[iroha-js-base-source] verified ${inspected.metrics.archiveEntries} entries ` +
      `(${inspected.metrics.regularFiles} files, ${inspected.metrics.directories} directories), ` +
      `${baseArchive.bytes} compressed bytes, ${inspected.metrics.uncompressedBytes} uncompressed bytes.\n`
  );
}

function printInventory(options) {
  assert(
    options.archive && options.expectedCommit && options.expectedTree,
    '--print-inventory requires --archive, --expected-commit, and --expected-tree'
  );
  const archivePath = path.resolve(options.archive);
  const archiveStat = fs.lstatSync(archivePath, { throwIfNoEntry: false });
  assert(
    archiveStat?.isFile() && !archiveStat.isSymbolicLink(),
    `bootstrap archive is missing, non-regular, or symlinked: ${archivePath}`
  );
  assert(archiveStat.size <= HARD_MAX_COMPRESSED_BYTES, 'bootstrap archive exceeds the hard compressed-size limit');
  const compressedBytes = fs.readFileSync(archivePath);
  const tarBytes = zlib.gunzipSync(compressedBytes, { maxOutputLength: HARD_MAX_UNCOMPRESSED_BYTES });
  const bootstrap = {
    sourceCommit: options.expectedCommit,
    sourceTree: options.expectedTree,
    maxCompressedBytes: HARD_MAX_COMPRESSED_BYTES,
    maxUncompressedBytes: HARD_MAX_UNCOMPRESSED_BYTES,
    maxEntries: HARD_MAX_ENTRIES,
    maxFileBytes: HARD_MAX_FILE_BYTES,
    uncompressedBytes: tarBytes.byteLength,
    archiveEntries: 305,
    regularFiles: 285,
    directories: 20,
    globalPaxHeaders: 1,
    physicalHeaders: 306,
    payloadBytes: null,
  };
  const firstPass = inspectArchive(compressedBytes, bootstrap);
  bootstrap.payloadBytes = firstPass.metrics.payloadBytes;
  const inspected = inspectArchive(compressedBytes, bootstrap);
  process.stdout.write(inspected.inventory);
  process.stderr.write(`${JSON.stringify(inspected.metrics)}\n`);
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.printInventory) {
    assert(!options.manifest && !options.extract, '--print-inventory cannot be combined with --manifest or --extract');
    printInventory(options);
  } else {
    assert(
      options.manifest,
      'usage: verify-iroha-js-base-source-archive.mjs --manifest <candidate.json> [--extract <new-directory>]'
    );
    assert(
      !options.archive && !options.expectedCommit && !options.expectedTree,
      'archive bootstrap arguments require --print-inventory'
    );
    verifyFromManifest(options);
  }
} catch (error) {
  process.stderr.write(`[iroha-js-base-source][error] ${error.message}\n`);
  process.exitCode = 1;
}
