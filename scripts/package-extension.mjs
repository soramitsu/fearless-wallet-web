#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const DEFAULT_SOURCE = 'dist/extension/chrome';
const DEFAULT_OUTPUT = 'dist/extension/chrome/fearless-wallet-extension-chrome.zip';
const UTF8_FLAG = 0x0800;
const DOS_TIME = 0;
const DOS_DATE = 0x21; // 1980-01-01, the earliest portable ZIP timestamp.
const MAX_ZIP32_VALUE = 0xffffffff;
const MAX_ZIP32_ENTRIES = 0xffff;
const CRC32_TABLE = makeCrc32Table();

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function fail(message) {
  throw new Error(message);
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

function assertZip32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_ZIP32_VALUE) {
    fail(`${label} exceeds the deterministic ZIP32 package limit`);
  }
}

function normalizedRelativePath(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath).split(path.sep).join('/');

  if (!relative || relative.startsWith('../') || path.posix.isAbsolute(relative)) {
    fail(`extension package path escapes its source directory: ${filePath}`);
  }
  if (
    relative.includes('\\') ||
    relative.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    fail(`extension package path is not a normalized relative path: ${relative}`);
  }

  return relative;
}

async function collectFiles(rootDir, excludedPaths, outputPath) {
  const files = [];
  const outputDirectory = path.dirname(outputPath);
  const temporaryPrefix = `${path.basename(outputPath)}.tmp-`;

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareNames(left.name, right.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      const resolvedPath = path.resolve(entryPath);

      if (excludedPaths.has(resolvedPath)) continue;
      if (path.dirname(resolvedPath) === outputDirectory && path.basename(resolvedPath).startsWith(temporaryPrefix)) {
        fail(`extension package found stale temporary output: ${entryPath}`);
      }
      if (entry.isSymbolicLink()) fail(`extension package refuses symbolic link: ${entryPath}`);
      if (entry.isDirectory()) {
        await visit(entryPath);
        continue;
      }
      if (!entry.isFile()) fail(`extension package refuses unsupported filesystem entry: ${entryPath}`);

      files.push({
        bytes: await fs.readFile(entryPath),
        name: normalizedRelativePath(rootDir, entryPath),
      });
    }
  }

  await visit(rootDir);
  files.sort((left, right) => compareNames(left.name, right.name));
  return files;
}

function encodeEntry({ bytes, name }, localOffset) {
  const nameBytes = Buffer.from(name, 'utf8');
  if (nameBytes.length > 0xffff) fail(`extension package path is too long for ZIP32: ${name}`);

  const deflated = deflateRawSync(bytes, { level: 9 });
  const useDeflate = deflated.length < bytes.length;
  const compressed = useDeflate ? deflated : bytes;
  const method = useDeflate ? 8 : 0;
  const checksum = crc32(bytes);

  assertZip32(bytes.length, `${name} uncompressed size`);
  assertZip32(compressed.length, `${name} compressed size`);
  assertZip32(localOffset, `${name} local offset`);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(UTF8_FLAG, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE((3 << 8) | 20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(UTF8_FLAG, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(DOS_TIME, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(localOffset, 42);

  return {
    central: Buffer.concat([central, nameBytes]),
    local: Buffer.concat([local, nameBytes, compressed]),
  };
}

export async function packageExtension({ sourceDir, outputPath }) {
  sourceDir = path.resolve(sourceDir);
  outputPath = path.resolve(outputPath);
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;

  const sourceStat = await fs.stat(sourceDir).catch((error) => fail(`cannot read extension source: ${error.message}`));
  if (!sourceStat.isDirectory()) fail(`extension source is not a directory: ${sourceDir}`);

  const files = await collectFiles(sourceDir, new Set([outputPath, temporaryPath]), outputPath);
  if (files.length === 0) fail(`extension source is empty: ${sourceDir}`);
  if (files.length > MAX_ZIP32_ENTRIES) fail('extension package has too many files for ZIP32');

  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const file of files) {
    const encoded = encodeEntry(file, localOffset);
    localParts.push(encoded.local);
    centralParts.push(encoded.central);
    localOffset += encoded.local.length;
    assertZip32(localOffset, 'ZIP local data size');
  }

  const centralDirectory = Buffer.concat(centralParts);
  assertZip32(centralDirectory.length, 'ZIP central directory size');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);

  const archive = Buffer.concat([...localParts, centralDirectory, end]);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(temporaryPath, archive, { mode: 0o644 });
  await fs.rename(temporaryPath, outputPath);

  return {
    byteLength: archive.length,
    fileCount: files.length,
    outputPath,
    sha256: createHash('sha256').update(archive).digest('hex'),
  };
}

function usage() {
  return `Usage: node scripts/package-extension.mjs [--source DIR] [--output FILE]\n\nCreates a deterministic, sorted ZIP with fixed metadata and refuses symlinks.`;
}

function parseArguments(argv) {
  let sourceDir = DEFAULT_SOURCE;
  let outputPath = DEFAULT_OUTPUT;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument !== '--source' && argument !== '--output') fail(`unknown argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${argument} requires a path`);
    index += 1;
    if (argument === '--source') sourceDir = value;
    else outputPath = value;
  }

  return { outputPath, sourceDir };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await packageExtension(options);
    console.log(
      `Extension package created: ${result.fileCount} files; ${result.byteLength} bytes; SHA-256 ${result.sha256}`
    );
  } catch (error) {
    console.error(`Extension packaging failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
