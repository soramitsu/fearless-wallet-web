#!/usr/bin/env node
// Yarn's registry audit skips file: packages, so the vendored copies of braces and picomatch would never be checked
// against a new advisory. This asks npm's bulk advisory endpoint about the upstream version each copy carries and
// fails on every advisory except the one that copy is reviewed to guard against, and only while its guarded files
// still match the reviewed digests in config/vendored-dependency-advisories.json.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BULK_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk';
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.length > 0;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readRepositoryFile = (path) => readFileSync(new URL(`../${path}`, import.meta.url));

export function loadManifest(read = readRepositoryFile) {
  const manifest = JSON.parse(read('config/vendored-dependency-advisories.json'));
  if (!isRecord(manifest) || Object.keys(manifest).length === 0) throw new Error('Unexpected vendored dependency manifest.');
  for (const [name, entry] of Object.entries(manifest)) {
    if (!isRecord(entry) || !isRecord(entry.copies) || !isRecord(entry.guardedFiles) || !Array.isArray(entry.reviewedAdvisories)
      || Object.keys(entry.copies).length === 0 || Object.keys(entry.guardedFiles).length === 0
      || !entry.reviewedAdvisories.every((url) => /^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9-]+$/.test(url))) {
      throw new Error(`Unexpected vendored dependency manifest entry: ${name}`);
    }
  }
  return manifest;
}

// Fails closed: a copy that is not the listed package and version, or a guarded file that differs from its reviewed
// digest, stops the audit before anything is exempted.
export function verifyCopies(manifest, read = readRepositoryFile) {
  for (const [name, entry] of Object.entries(manifest)) {
    for (const [directory, version] of Object.entries(entry.copies)) {
      const packageJson = JSON.parse(read(`${directory}/package.json`));
      if (packageJson.name !== name || packageJson.version !== version) {
        throw new Error(`${directory} is not ${name}@${version}`);
      }
    }
    for (const [file, digest] of Object.entries(entry.guardedFiles)) {
      if (sha256(read(file)) !== digest) throw new Error(`Guarded file changed without review: ${file}`);
    }
  }
}

export async function auditVendoredDependencies({ read = readRepositoryFile, fetchRegistry = fetch, log = console.log } = {}) {
  const manifest = loadManifest(read);
  verifyCopies(manifest, read);
  const query = Object.fromEntries(Object.entries(manifest).map(([name, entry]) => [name, [...new Set(Object.values(entry.copies))].sort()]));
  const response = await fetchRegistry(BULK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(query),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Vendored dependency advisory query failed: HTTP ${response.status}`);
  const body = await response.json();
  if (!isRecord(body)) throw new Error('Unexpected vendored dependency advisory response.');
  let failures = 0;
  let reviewed = 0;
  for (const [name, advisories] of Object.entries(body)) {
    if (!Object.hasOwn(query, name) || !Array.isArray(advisories)) throw new Error('Unexpected vendored dependency advisory response.');
    for (const advisory of advisories) {
      if (!isRecord(advisory) || !nonempty(advisory.url) || !nonempty(advisory.title) || !nonempty(advisory.vulnerable_versions)
        || !SEVERITIES.includes(advisory.severity)
        || !(nonempty(advisory.id) || (Number.isSafeInteger(advisory.id) && advisory.id > 0))) {
        throw new Error('Unexpected vendored dependency advisory.');
      }
      if (manifest[name].reviewedAdvisories.includes(advisory.url)) {
        reviewed++;
        log(`Guarded vendored copy: ${name} ${query[name].join(', ')} ${advisory.url}`);
      } else {
        failures++;
        log(`Unreviewed advisory for vendored ${name} ${query[name].join(', ')}: ${JSON.stringify(advisory)}`);
      }
    }
  }
  log(`Vendored dependency audit: ${failures} unreviewed advisories; ${reviewed} guarded (${Object.keys(query).join(', ')}).`);
  return failures ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await auditVendoredDependencies();
}
