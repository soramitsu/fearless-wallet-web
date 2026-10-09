#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const ALLOWLIST_PATH = 'config/github-actions-allowlist.json';
const PINNED_REFERENCE =
  /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)((?:\/[A-Za-z0-9._-]+)*)@([0-9a-f]{40})$/u;
const LOCAL_REFERENCE = /^\.\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/u;

export class GitHubActionsAuditError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GitHubActionsAuditError';
  }
}

function fail(message) {
  throw new GitHubActionsAuditError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function globToRegExp(pattern) {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replaceAll('*', '.*')}$`, 'u');
}

// The allowlist mirrors the repository's "Allow select actions" settings. A
// third-party action is accepted only when it is listed here with the policy
// rule that admits it, so the audit fails before GitHub would refuse to start
// the workflow (which is how browser-actions/setup-firefox broke every CI run).
export function parseAllowlist(allowlist) {
  if (!isPlainObject(allowlist) || allowlist.schemaVersion !== 1) fail(`${ALLOWLIST_PATH} schemaVersion must be 1`);
  const policy = allowlist.repositoryPolicy;
  if (
    !isPlainObject(policy) ||
    policy.allowedActions !== 'selected' ||
    typeof policy.githubOwnedAllowed !== 'boolean' ||
    typeof policy.verifiedAllowed !== 'boolean' ||
    !Array.isArray(policy.patternsAllowed) ||
    !policy.patternsAllowed.every((pattern) => typeof pattern === 'string' && pattern.length > 0)
  ) {
    fail(`${ALLOWLIST_PATH} repositoryPolicy must mirror the selected-actions repository settings`);
  }
  if (!policy.githubOwnedAllowed) fail(`${ALLOWLIST_PATH} repository policy must allow GitHub-owned actions`);
  if (!Array.isArray(allowlist.allowedActions)) fail(`${ALLOWLIST_PATH} allowedActions must be an array`);

  const patterns = policy.patternsAllowed.map(globToRegExp);
  const allowed = new Set();
  for (const [index, entry] of allowlist.allowedActions.entries()) {
    const label = `${ALLOWLIST_PATH} allowedActions[${index}]`;
    if (!isPlainObject(entry) || typeof entry.uses !== 'string' || !PINNED_REFERENCE.test(entry.uses)) {
      fail(`${label} must name an owner/repo action pinned to a full commit SHA`);
    }
    if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) fail(`${label} needs a review reason`);
    if (entry.policyBasis === 'verified-creator') {
      if (!policy.verifiedAllowed) fail(`${label} relies on verified creators, which the repository policy disallows`);
    } else if (entry.policyBasis === 'pattern') {
      const [actionPath] = entry.uses.split('@');
      if (!patterns.some((pattern) => pattern.test(entry.uses) || pattern.test(actionPath))) {
        fail(`${label} ${entry.uses} matches no repository patternsAllowed entry`);
      }
    } else {
      fail(`${label} policyBasis must be "pattern" or "verified-creator"`);
    }
    allowed.add(entry.uses);
  }
  return allowed;
}

function yamlScalar(value) {
  return value
    .replace(/\s+#.*$/u, '')
    .trim()
    .replace(/^(["'])(.*)\1$/u, '$2');
}

export function findUsesReferences(content, label) {
  const references = [];
  for (const [index, line] of content.split(/\r?\n/u).entries()) {
    if (/^\s*(?:-\s+)?\{.*(?:^|[\s{,])["']?uses["']?\s*:/u.test(line)) {
      fail(`${label}:${index + 1} uses an unsupported flow-style "uses:"; write it as a block-style step key`);
    }
    const match = /^\s*(?:-\s+)?["']?uses["']?\s*:(.*)$/u.exec(line);
    if (!match) continue;
    const value = yamlScalar(match[1]);
    if (!value) fail(`${label}:${index + 1} has an empty or multi-line "uses:" value`);
    references.push({ line: index + 1, value });
  }
  return references;
}

export function auditUsesReference(value, allowed, location) {
  if (LOCAL_REFERENCE.test(value) && !value.split('/').includes('..')) return;
  if (value.startsWith('docker://')) {
    fail(`${location} ${JSON.stringify(value)} runs a container image directly; use a reviewed pinned action`);
  }
  const pinned = PINNED_REFERENCE.exec(value);
  if (!pinned) {
    fail(`${location} ${JSON.stringify(value)} must be pinned to a full 40-character commit SHA`);
  }
  if (pinned[1] === 'actions') return;
  if (!allowed.has(value)) {
    fail(
      `${location} ${JSON.stringify(value)} is not a GitHub-owned actions/* action and is not in ${ALLOWLIST_PATH}; ` +
        'the repository Actions policy would refuse to start this workflow'
    );
  }
}

async function collectWorkflowFiles(rootDir) {
  const files = [];
  async function walk(relativeDir) {
    let entries;
    try {
      entries = await fs.readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' && relativeDir !== '.github/workflows') return;
      fail(`cannot read ${relativeDir}: ${error.message}`);
    }
    for (const entry of entries) {
      const relativePath = `${relativeDir}/${entry.name}`;
      if (entry.isDirectory()) await walk(relativePath);
      else if (entry.isFile() && /\.ya?ml$/u.test(entry.name)) files.push(relativePath);
    }
  }
  await walk('.github/workflows');
  await walk('.github/actions');
  return files.sort();
}

export async function auditGitHubActions({ rootDir }) {
  rootDir = path.resolve(rootDir);

  let allowlist;
  try {
    allowlist = JSON.parse(await fs.readFile(path.join(rootDir, ALLOWLIST_PATH), 'utf8'));
  } catch (error) {
    fail(`cannot read ${ALLOWLIST_PATH}: ${error.message}`);
  }
  const allowed = parseAllowlist(allowlist);

  const files = await collectWorkflowFiles(rootDir);
  if (files.length === 0) fail('no GitHub workflow files found');
  let referenceCount = 0;
  for (const file of files) {
    const content = await fs.readFile(path.join(rootDir, file), 'utf8');
    for (const reference of findUsesReferences(content, file)) {
      auditUsesReference(reference.value, allowed, `${file}:${reference.line}`);
      referenceCount += 1;
    }
  }

  return { fileCount: files.length, referenceCount };
}

function usage() {
  return `Usage: node scripts/audit-github-actions.mjs [--root DIR]

Requires every workflow "uses:" to be a local action or a GitHub-owned actions/* action pinned to a full commit SHA, unless ${ALLOWLIST_PATH} admits it under the repository Actions policy.`;
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
    const result = await auditGitHubActions(options);
    console.log(
      `GitHub Actions audit passed: ${result.referenceCount} pinned action references in ${result.fileCount} files`
    );
  } catch (error) {
    console.error(`GitHub Actions audit failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
