#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditVendoredIrohaJsSdk,
  parseReviewedIrohaArchive,
  VENDORED_IROHA_ARCHIVE,
  VENDORED_IROHA_DEPENDENCY,
} from './audit-vendored-iroha-js-sdk.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-vendored-iroha-audit-test-'));
const fixtureArchive = path.join(temporaryDirectory, VENDORED_IROHA_ARCHIVE);
const installedDirectory = path.join(temporaryDirectory, 'node_modules/@iroha/iroha-js');

async function writePackageJson(dependency = VENDORED_IROHA_DEPENDENCY) {
  await fs.writeFile(
    path.join(temporaryDirectory, 'package.json'),
    `${JSON.stringify({ dependencies: { '@iroha/iroha-js': dependency } }, null, 2)}\n`
  );
}

try {
  await fs.mkdir(path.dirname(fixtureArchive), { recursive: true });
  await fs.copyFile(path.join(rootDir, VENDORED_IROHA_ARCHIVE), fixtureArchive);
  await writePackageJson();

  const archiveFiles = parseReviewedIrohaArchive(await fs.readFile(fixtureArchive));
  for (const [relativePath, contents] of archiveFiles) {
    const destination = path.join(installedDirectory, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, contents);
  }

  const result = await auditVendoredIrohaJsSdk({ auditRoot: temporaryDirectory });
  assert.equal(result.archiveFileCount, 141);
  assert.equal(result.installedFileCount, 141);

  const installedManifest = path.join(installedDirectory, 'package.json');
  await fs.appendFile(installedManifest, '\n');
  await assert.rejects(
    auditVendoredIrohaJsSdk({ auditRoot: temporaryDirectory }),
    /installed package differs from the reviewed vendored archive/u
  );
  await fs.writeFile(installedManifest, archiveFiles.get('package.json'));

  await writePackageJson('https://example.invalid/iroha-js.tgz');
  await assert.rejects(
    auditVendoredIrohaJsSdk({ auditRoot: temporaryDirectory }),
    /package\.json must pin @iroha\/iroha-js/u
  );
  await writePackageJson();

  const tamperedArchive = await fs.readFile(fixtureArchive);
  tamperedArchive[32] ^= 0x01;
  await fs.writeFile(fixtureArchive, tamperedArchive);
  await assert.rejects(auditVendoredIrohaJsSdk({ auditRoot: temporaryDirectory }), /vendored archive SHA-256/u);

  console.log('Vendored Iroha JS SDK audit self-test passed (4 checks)');
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}
