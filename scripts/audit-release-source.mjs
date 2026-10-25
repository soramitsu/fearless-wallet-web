#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(message);
}

function git(rootDir, args) {
  try {
    return execFileSync('git', ['-C', rootDir, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    fail(`git ${args.join(' ')} failed: ${detail}`);
  }
}

// Wording that waits for the owner's approval carries this key (empty, never shown) in every
// locale file. A release is built only after the owner has signed the wording off and the key is gone.
export const DRAFT_COPY_MARKER = 'draftAwaitingOwnerSignOff';

function draftCopyPaths(messages, prefix = '') {
  if (!messages || typeof messages !== 'object' || Array.isArray(messages)) return [];

  return Object.entries(messages).flatMap(([key, value]) => {
    const keyPath = prefix ? `${prefix}.${key}` : key;

    return key === DRAFT_COPY_MARKER ? [keyPath] : draftCopyPaths(value, keyPath);
  });
}

async function findDraftCopy(rootDir) {
  const localesDir = path.join(rootDir, 'src/locales');
  let locales;

  try {
    locales = await fs.readdir(localesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    fail(`cannot read ${localesDir}: ${error.message}`);
  }

  const drafts = [];

  for (const locale of locales.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort()) {
    const file = path.join(localesDir, locale, 'translation.json');
    let messages;

    try {
      messages = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      fail(`cannot read ${path.relative(rootDir, file)}: ${error.message}`);
    }

    for (const keyPath of draftCopyPaths(messages)) drafts.push(`src/locales/${locale}/translation.json ${keyPath}`);
  }

  return drafts;
}

function summarizeDirtyStatus(status) {
  const entries = status.split('\n').filter(Boolean);
  const preview = entries.slice(0, 12).join('\n');
  const remainder = entries.length > 12 ? `\n... and ${entries.length - 12} more` : '';
  return `${entries.length} changed or untracked path${entries.length === 1 ? '' : 's'}:\n${preview}${remainder}`;
}

export async function auditReleaseSource({ requireTag = false, rootDir }) {
  rootDir = path.resolve(rootDir);
  git(rootDir, ['rev-parse', '--is-inside-work-tree']);

  const status = git(rootDir, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (status) fail(`release source must be a clean Git checkout; ${summarizeDirtyStatus(status)}`);

  git(rootDir, ['diff', '--check']);
  const commit = git(rootDir, ['rev-parse', 'HEAD']);
  const branch = git(rootDir, ['branch', '--show-current']) || '(detached)';

  let packageJson;
  try {
    packageJson = JSON.parse(await fs.readFile(path.join(rootDir, 'package.json'), 'utf8'));
  } catch (error) {
    fail(`cannot read package.json: ${error.message}`);
  }
  if (typeof packageJson.version !== 'string' || !packageJson.version) fail('package.json version is missing');

  const matchingTags = git(rootDir, ['tag', '--points-at', 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .filter((tag) => tag === packageJson.version || tag === `v${packageJson.version}`);
  if (requireTag && matchingTags.length === 0) {
    fail(`release commit is not tagged ${packageJson.version} or v${packageJson.version}`);
  }

  const drafts = await findDraftCopy(rootDir);
  if (drafts.length) {
    fail(
      `user-facing wording still awaits the owner's sign-off (${drafts.join('; ')}); ` +
        `once the owner has approved it, remove the ${DRAFT_COPY_MARKER} key from every locale file`
    );
  }

  return {
    branch,
    commit,
    tag: matchingTags[0] ?? null,
    version: packageJson.version,
  };
}

function usage() {
  return `Usage: node scripts/audit-release-source.mjs [--root DIR] [--require-tag]\n\nRefuses release provenance from a dirty Git checkout, or from one whose locale files still mark wording as a
draft awaiting the owner's sign-off, and reports the exact source commit.`;
}

function parseArguments(argv) {
  let requireTag = false;
  let rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--require-tag') {
      requireTag = true;
      continue;
    }
    if (argument === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail('--root requires a path');
      rootDir = path.resolve(value);
      index += 1;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  return { requireTag, rootDir };
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const result = await auditReleaseSource(options);
    const tag = result.tag ? `; tag ${result.tag}` : '';
    console.log(
      `Release source audit passed: version ${result.version}; commit ${result.commit}; branch ${result.branch}${tag}`
    );
  } catch (error) {
    console.error(`Release source audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
