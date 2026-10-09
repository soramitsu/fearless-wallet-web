#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const EXPECTED_PACKAGE_MANAGER = 'yarn@4.17.0';
// Other package managers resolve a different dependency graph (pnpm-lock.yaml
// once pulled an older bcryptjs and extra @polkadot crypto copies), so yarn.lock
// must stay the only lockfile anyone can install from.
export const FORBIDDEN_LOCKFILES = [
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'bun.lock',
  'bun.lockb',
];
export const REVIEWED_NPM_REGISTRIES = ['https://registry.yarnpkg.com', 'https://registry.npmjs.org'];

export class PackageManagerAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PackageManagerAuditError';
  }
}

function fail(message) {
  throw new PackageManagerAuditError(message);
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function readText(rootDir, relativePath) {
  try {
    return await fs.readFile(path.join(rootDir, relativePath), 'utf8');
  } catch (error) {
    fail(`cannot read ${relativePath}: ${error.message}`);
  }
}

function parseVersion(value, label) {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(value);
  if (!match) fail(`${label} must be an exact x.y.z Node version, received ${JSON.stringify(value)}`);
  return match.slice(1, 4).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

// Supports the space-separated comparator sets used by package.json engines
// (for example ">=24 <25"). Anything else fails closed instead of guessing.
export function satisfiesEnginesRange(version, range) {
  const target = parseVersion(version, 'Node version');
  if (typeof range !== 'string' || range.trim().length === 0) fail('package.json engines.node is missing');
  if (/\|\||[\^~]|\s-\s/u.test(range)) fail(`unsupported engines.node range syntax ${JSON.stringify(range)}`);

  return range
    .trim()
    .split(/\s+/u)
    .every((comparator) => {
      const match = /^(>=|<=|>|<|=)?v?(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/u.exec(comparator);
      if (!match) fail(`unsupported engines.node comparator ${JSON.stringify(comparator)}`);
      const [, operator = '=', major, minor, patch] = match;
      const floor = [Number(major), Number(minor ?? 0), Number(patch ?? 0)];
      // A partial version covers its whole range: "<=24" means "<25.0.0".
      const ceiling =
        patch !== undefined ? null : minor !== undefined ? [floor[0], floor[1] + 1, 0] : [floor[0] + 1, 0, 0];
      const fromFloor = compareVersions(target, floor);
      const toCeiling = ceiling ? compareVersions(target, ceiling) : null;

      if (operator === '>=') return fromFloor >= 0;
      if (operator === '<') return fromFloor < 0;
      if (operator === '>') return ceiling ? toCeiling >= 0 : fromFloor > 0;
      if (operator === '<=') return ceiling ? toCeiling < 0 : fromFloor <= 0;
      return ceiling ? fromFloor >= 0 && toCeiling < 0 : fromFloor === 0;
    });
}

function yamlScalar(value) {
  return value
    .replace(/\s+#.*$/u, '')
    .trim()
    .replace(/^(["'])(.*)\1$/u, '$2');
}

async function workflowFiles(rootDir) {
  const workflowDir = path.join(rootDir, '.github/workflows');
  let entries;
  try {
    entries = await fs.readdir(workflowDir, { withFileTypes: true });
  } catch (error) {
    fail(`cannot read .github/workflows: ${error.message}`);
  }
  return entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => `.github/workflows/${entry.name}`)
    .sort();
}

async function auditNodeVersionPins(rootDir, nodeVersion) {
  let ciPins = 0;
  for (const workflow of await workflowFiles(rootDir)) {
    const lines = (await readText(rootDir, workflow)).split(/\r?\n/u);
    for (const [index, line] of lines.entries()) {
      const pin = /^\s*node-version(-file)?:\s*(.+)$/u.exec(line);
      if (!pin) continue;
      const value = yamlScalar(pin[2]);
      const location = `${workflow}:${index + 1}`;
      if (pin[1]) {
        if (value !== '.nvmrc') fail(`${location} node-version-file must be .nvmrc, received ${JSON.stringify(value)}`);
      } else if (value !== nodeVersion) {
        fail(`${location} node-version ${JSON.stringify(value)} does not match .nvmrc ${nodeVersion}`);
      }
      if (workflow === '.github/workflows/ci.yml') ciPins += 1;
    }
  }
  if (ciPins === 0) fail('.github/workflows/ci.yml must pin Node through node-version or node-version-file');
}

function auditYarnrc(yarnrc) {
  let inGitApprovals = false;
  for (const [index, line] of yarnrc.split(/\r?\n/u).entries()) {
    const registry = /^\s*npmRegistryServer:\s*(.+)$/u.exec(line);
    if (registry) {
      const value = yamlScalar(registry[1]).replace(/\/+$/u, '');
      if (!REVIEWED_NPM_REGISTRIES.includes(value)) {
        fail(
          `.yarnrc.yml:${index + 1} names unreviewed registry ${JSON.stringify(value)}; ` +
            'scoped or custom registries must be publicly reachable and reviewed before use'
        );
      }
    }

    if (/^\S/u.test(line)) inGitApprovals = /^approvedGitRepositories:/u.test(line);
    const approvesEverything = inGitApprovals && /(^|[\s[,-])["']?\*\*["']?\s*(?:[\],]|$)/u.test(line);
    if (approvesEverything) {
      fail(`.yarnrc.yml:${index + 1} approves every Git repository; list reviewed repositories explicitly`);
    }
  }
}

export async function auditPackageManager({ rootDir }) {
  rootDir = path.resolve(rootDir);

  for (const lockfile of FORBIDDEN_LOCKFILES) {
    if (await exists(path.join(rootDir, lockfile))) {
      fail(`${lockfile} must not exist; yarn.lock is the only reviewed lockfile`);
    }
  }

  let packageJson;
  try {
    packageJson = JSON.parse(await readText(rootDir, 'package.json'));
  } catch (error) {
    if (error instanceof PackageManagerAuditError) throw error;
    fail(`package.json is not valid JSON: ${error.message}`);
  }
  if (packageJson.packageManager !== EXPECTED_PACKAGE_MANAGER) {
    fail(
      `package.json packageManager must be ${EXPECTED_PACKAGE_MANAGER}, received ${JSON.stringify(packageJson.packageManager)}`
    );
  }

  const nodeVersion = (await readText(rootDir, '.nvmrc')).trim();
  parseVersion(nodeVersion, '.nvmrc');
  if (!satisfiesEnginesRange(nodeVersion, packageJson.engines?.node)) {
    fail(
      `.nvmrc ${nodeVersion} does not satisfy package.json engines.node ${JSON.stringify(packageJson.engines.node)}`
    );
  }
  await auditNodeVersionPins(rootDir, nodeVersion);

  auditYarnrc(await readText(rootDir, '.yarnrc.yml'));

  const yarnLock = await readText(rootDir, 'yarn.lock');
  if (!/^__metadata:\r?\n {2}version: \d+\r?\n/mu.test(yarnLock)) {
    fail('yarn.lock lacks the Yarn Berry __metadata header; regenerate it with the pinned Yarn version');
  }

  return { nodeVersion, packageManager: packageJson.packageManager };
}

function usage() {
  return `Usage: node scripts/audit-package-manager.mjs [--root DIR]

Requires yarn.lock as the only lockfile, the pinned Yarn release, one Node version across .nvmrc, engines, and CI, and only reviewed npm registries.`;
}

function parseArguments(argv) {
  let rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail('--root requires a path');
      rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  return { rootDir };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await auditPackageManager(options);
    console.log(`Package manager audit passed: ${result.packageManager}; Node ${result.nodeVersion}`);
  } catch (error) {
    console.error(`Package manager audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
