#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { auditGitHubActions } from './audit-github-actions.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const auditScript = path.join(scriptDirectory, 'audit-github-actions.mjs');

const CHECKOUT = 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5';
const SETUP_FIREFOX = 'browser-actions/setup-firefox@0bc507ddf224827e3b1af68e014d5e42ab93e795';
const REVIEWED_THIRD_PARTY = 'example-org/reviewed-action@1111111111111111111111111111111111111111';

function allowlist({ patternsAllowed = [], verifiedAllowed = true, allowedActions = [] } = {}) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      repositoryPolicy: {
        allowedActions: 'selected',
        githubOwnedAllowed: true,
        verifiedAllowed,
        patternsAllowed,
        checkedAt: '2026-10-09',
        source: 'fixture',
      },
      allowedActions,
    },
    null,
    2
  )}\n`;
}

function workflow(...steps) {
  return `name: Fixture\non:\n  pull_request:\njobs:\n  verify:\n    runs-on: ubuntu-latest\n    steps:\n${steps.join('\n')}\n`;
}

const VALID_FILES = {
  'config/github-actions-allowlist.json': allowlist(),
  '.github/workflows/ci.yml': workflow(
    `      - uses: ${CHECKOUT} # v4`,
    '      - name: Echo a step that mentions uses: in a script\n        run: echo "uses: browser-actions/setup-firefox@v1"'
  ),
};

let passed = 0;
let fixtureNumber = 0;

async function createFixture(tempRoot, label, mutate) {
  fixtureNumber += 1;
  const rootDir = path.join(
    tempRoot,
    `${String(fixtureNumber).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/giu, '-')}`
  );
  const files = { ...VALID_FILES };
  mutate?.(files);
  for (const [name, content] of Object.entries(files)) {
    if (content === null) continue;
    const destination = path.join(rootDir, ...name.split('/'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
  return rootDir;
}

async function expectPass(tempRoot, label, mutate) {
  const rootDir = await createFixture(tempRoot, label, mutate);
  const result = await auditGitHubActions({ rootDir });
  passed += 1;
  return { result, rootDir };
}

async function expectFailure(tempRoot, label, mutate, expected) {
  const rootDir = await createFixture(tempRoot, label, mutate);
  await assert.rejects(auditGitHubActions({ rootDir }), expected, label);
  passed += 1;
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-github-actions-audit-'));
try {
  const repository = await auditGitHubActions({ rootDir: repositoryRoot });
  assert.ok(repository.referenceCount > 0);
  passed += 1;

  const clean = await expectPass(tempRoot, 'pinned-github-owned-action');
  assert.equal(clean.result.referenceCount, 1);
  const cli = spawnSync(process.execPath, [auditScript, '--root', clean.rootDir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /GitHub Actions audit passed: 1 pinned action references in 1 files/u);
  passed += 1;

  await expectFailure(
    tempRoot,
    'third-party-setup-firefox',
    (files) => (files['.github/workflows/ci.yml'] = workflow(`      - uses: ${SETUP_FIREFOX} # v1.7.2`)),
    /browser-actions\/setup-firefox@.* is not a GitHub-owned actions\/\* action/u
  );
  const failingCli = spawnSync(
    process.execPath,
    [
      auditScript,
      '--root',
      await createFixture(
        tempRoot,
        'cli-third-party',
        (files) => (files['.github/workflows/ci.yml'] = workflow(`      - uses: ${SETUP_FIREFOX}`))
      ),
    ],
    { encoding: 'utf8' }
  );
  assert.equal(failingCli.status, 1);
  assert.match(failingCli.stderr, /GitHub Actions audit failed: .*repository Actions policy would refuse/u);
  passed += 1;

  for (const [label, reference] of [
    ['mutable-tag', 'actions/checkout@v4'],
    ['branch-ref', 'actions/checkout@main'],
    ['short-sha', 'actions/checkout@34e1148'],
    ['uppercase-sha', 'actions/checkout@34E114876B0B11C390A56381AD16EBD13914F8D5'],
    ['unpinned', 'actions/checkout'],
  ]) {
    await expectFailure(
      tempRoot,
      label,
      (files) => (files['.github/workflows/ci.yml'] = workflow(`      - uses: ${reference}`)),
      /must be pinned to a full 40-character commit SHA/u
    );
  }
  await expectFailure(
    tempRoot,
    'docker-image',
    (files) => (files['.github/workflows/ci.yml'] = workflow('      - uses: docker://alpine:3.20')),
    /runs a container image directly/u
  );
  await expectFailure(
    tempRoot,
    'flow-style-uses',
    (files) => (files['.github/workflows/ci.yml'] = workflow(`      - { name: hidden, uses: ${SETUP_FIREFOX} }`)),
    /unsupported flow-style "uses:"/u
  );
  await expectFailure(
    tempRoot,
    'quoted-third-party',
    (files) => (files['.github/workflows/ci.yml'] = workflow(`      - "uses": "${SETUP_FIREFOX}"`)),
    /is not a GitHub-owned actions\/\* action/u
  );
  await expectFailure(
    tempRoot,
    'reusable-workflow-from-other-owner',
    (files) =>
      (files['.github/workflows/ci.yml'] =
        'on:\n  pull_request:\njobs:\n  call:\n    uses: example-org/workflows/.github/workflows/ci.yml@1111111111111111111111111111111111111111\n'),
    /is not a GitHub-owned actions\/\* action/u
  );
  await expectFailure(
    tempRoot,
    'composite-action-step',
    (files) =>
      (files['.github/actions/setup/action.yml'] =
        `runs:\n  using: composite\n  steps:\n    - uses: ${SETUP_FIREFOX}\n`),
    /\.github\/actions\/setup\/action\.yml:4 .* is not a GitHub-owned/u
  );

  await expectPass(tempRoot, 'local-action', (files) => {
    files['.github/workflows/ci.yml'] = workflow(`      - uses: ${CHECKOUT}`, '      - uses: ./.github/actions/setup');
    files['.github/actions/setup/action.yml'] = `runs:\n  using: composite\n  steps:\n    - uses: ${CHECKOUT}\n`;
  });
  await expectFailure(
    tempRoot,
    'local-action-traversal',
    (files) => (files['.github/workflows/ci.yml'] = workflow('      - uses: ./../outside')),
    /must be pinned/u
  );

  await expectPass(tempRoot, 'allowlisted-by-repository-pattern', (files) => {
    files['config/github-actions-allowlist.json'] = allowlist({
      patternsAllowed: ['example-org/reviewed-action@*'],
      allowedActions: [{ uses: REVIEWED_THIRD_PARTY, policyBasis: 'pattern', reason: 'fixture review' }],
    });
    files['.github/workflows/ci.yml'] = workflow(`      - uses: ${REVIEWED_THIRD_PARTY}`);
  });
  await expectFailure(
    tempRoot,
    'allowlisted-without-repository-pattern',
    (files) => {
      files['config/github-actions-allowlist.json'] = allowlist({
        allowedActions: [{ uses: SETUP_FIREFOX, policyBasis: 'pattern', reason: 'not admitted by the repository' }],
      });
      files['.github/workflows/ci.yml'] = workflow(`      - uses: ${SETUP_FIREFOX}`);
    },
    /matches no repository patternsAllowed entry/u
  );
  await expectFailure(
    tempRoot,
    'verified-creator-disallowed',
    (files) =>
      (files['config/github-actions-allowlist.json'] = allowlist({
        verifiedAllowed: false,
        allowedActions: [{ uses: REVIEWED_THIRD_PARTY, policyBasis: 'verified-creator', reason: 'fixture' }],
      })),
    /relies on verified creators, which the repository policy disallows/u
  );
  await expectFailure(
    tempRoot,
    'allowlist-entry-without-basis',
    (files) =>
      (files['config/github-actions-allowlist.json'] = allowlist({
        allowedActions: [{ uses: REVIEWED_THIRD_PARTY, reason: 'fixture' }],
      })),
    /policyBasis must be "pattern" or "verified-creator"/u
  );
  await expectFailure(
    tempRoot,
    'allowlist-entry-unpinned',
    (files) =>
      (files['config/github-actions-allowlist.json'] = allowlist({
        allowedActions: [{ uses: 'example-org/reviewed-action@v1', policyBasis: 'verified-creator', reason: 'x' }],
      })),
    /must name an owner\/repo action pinned to a full commit SHA/u
  );
  await expectFailure(
    tempRoot,
    'missing-allowlist',
    (files) => (files['config/github-actions-allowlist.json'] = null),
    /cannot read config\/github-actions-allowlist\.json/u
  );
  await expectFailure(
    tempRoot,
    'no-workflows',
    (files) => (files['.github/workflows/ci.yml'] = null),
    /cannot read \.github\/workflows/u
  );

  console.log(`GitHub Actions audit self-test passed (${passed} checks).`);
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}
