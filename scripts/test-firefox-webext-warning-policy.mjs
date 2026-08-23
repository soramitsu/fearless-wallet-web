#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createFirefoxWarningBaseline, verifyFirefoxWarningBaseline } from './firefox-webext-warning-policy.mjs';

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'fearless-firefox-warning-policy-'));
const sourceDir = path.join(temporaryRoot, 'dist/extension/firefox');
const warningFile = 'chunks/runtime.js';
const warningPath = path.join(sourceDir, warningFile);

async function expectFailure(label, operation, expectedMessage) {
  try {
    await operation();
    assert.fail(`${label} unexpectedly passed`);
  } catch (error) {
    assert.match(String(error), expectedMessage, label);
  }
}

function warning(overrides = {}) {
  return {
    _type: 'warning',
    code: 'DANGEROUS_EVAL',
    message: 'The Function constructor is eval.',
    description: 'Evaluation of strings as code can lead to security vulnerabilities.',
    file: warningFile,
    line: 1,
    column: 12,
    ...overrides,
  };
}

function lintResult(warnings = [warning()], overrides = {}) {
  return {
    count: warnings.length,
    summary: { errors: 0, notices: 0, warnings: warnings.length },
    metadata: {},
    errors: [],
    notices: [],
    warnings,
    ...overrides,
  };
}

async function verify(baseline, lint = lintResult(), overrides = {}) {
  return verifyFirefoxWarningBaseline({
    baseline,
    lintResult: lint,
    sourceDir,
    sourceDirLabel: 'dist/extension/firefox',
    webExtVersion: '10.4.0',
    ...overrides,
  });
}

try {
  await mkdir(path.dirname(warningPath), { recursive: true });
  await writeFile(warningPath, 'const globalObject = Function("return this")();\n');

  const baseline = await createFirefoxWarningBaseline({
    lintResult: lintResult(),
    sourceDir,
    sourceDirLabel: 'dist/extension/firefox',
    webExtVersion: '10.4.0',
  });
  const originalArtifact = await readFile(warningPath, 'utf8');
  await verify(baseline);

  await expectFailure(
    'new warning',
    () => verify(baseline, lintResult([warning(), warning({ column: 20 })])),
    /warning count drifted/
  );
  await expectFailure('removed warning', () => verify(baseline, lintResult([])), /warning count drifted/);
  await expectFailure(
    'warning location drift',
    () => verify(baseline, lintResult([warning({ column: 13 })])),
    /warning fingerprint digest drifted/
  );
  await expectFailure(
    'warning message drift',
    () => verify(baseline, lintResult([warning({ message: 'Changed warning text.' })])),
    /warning fingerprint digest drifted/
  );
  await expectFailure(
    'noncanonical warning path',
    () => verify(baseline, lintResult([warning({ file: 'chunks/../runtime.js' })])),
    /canonical relative POSIX path/
  );
  await expectFailure(
    'unreviewed warning code',
    () => verify(baseline, lintResult([warning({ code: 'NEW_WARNING' })])),
    /unreviewed code/
  );
  await expectFailure(
    'forged lint count',
    () => verify(baseline, lintResult([warning()], { count: 0 })),
    /summary\/count is inconsistent/
  );
  await expectFailure(
    'lint error',
    () =>
      verify(
        baseline,
        lintResult([warning()], {
          count: 2,
          summary: { errors: 1, notices: 0, warnings: 1 },
          errors: [{ code: 'BROKEN' }],
        })
      ),
    /lint errors are forbidden/
  );
  await expectFailure(
    'lint notice',
    () =>
      verify(
        baseline,
        lintResult([warning()], {
          count: 2,
          summary: { errors: 0, notices: 1, warnings: 1 },
          notices: [{ code: 'REVIEW' }],
        })
      ),
    /lint notices.*forbidden/
  );
  await expectFailure(
    'web-ext version drift',
    () => verify(baseline, lintResult(), { webExtVersion: '10.5.0' }),
    /webExtVersion must match/
  );

  const extraKeyBaseline = { ...structuredClone(baseline), forged: true };
  await expectFailure('baseline extra key', () => verify(extraKeyBaseline), /baseline keys must be exactly/);

  const sourceLabelBaseline = structuredClone(baseline);
  sourceLabelBaseline.sourceDir = 'dist/extension/other';
  await expectFailure('baseline source label drift', () => verify(sourceLabelBaseline), /baseline sourceDir must be/);

  const oversizedCountBaseline = structuredClone(baseline);
  oversizedCountBaseline.warningCount = 100_001;
  await expectFailure(
    'oversized baseline count',
    () => verify(oversizedCountBaseline),
    /bounded non-negative safe integer/
  );

  const duplicateArtifactBaseline = structuredClone(baseline);
  duplicateArtifactBaseline.artifacts.push(structuredClone(baseline.artifacts[0]));
  await expectFailure(
    'duplicate artifact',
    () => verify(duplicateArtifactBaseline),
    /every warning-bearing file exactly once/
  );

  const missingArtifactBaseline = structuredClone(baseline);
  missingArtifactBaseline.artifacts = [];
  await expectFailure(
    'missing artifact',
    () => verify(missingArtifactBaseline),
    /every warning-bearing file exactly once/
  );

  const traversalArtifactBaseline = structuredClone(baseline);
  traversalArtifactBaseline.artifacts[0].file = '../outside.js';
  await expectFailure('artifact traversal', () => verify(traversalArtifactBaseline), /canonical relative POSIX path/);

  const linkedSourceDir = path.join(temporaryRoot, 'linked-firefox');
  await symlink(sourceDir, linkedSourceDir, 'dir');
  await expectFailure(
    'symlink source root',
    () => verify(baseline, lintResult(), { sourceDir: linkedSourceDir }),
    /source directory must not be a symlink/
  );

  await writeFile(warningPath, `${originalArtifact}// drift\n`);
  await expectFailure('artifact content drift', () => verify(baseline), /artifact digest drifted/);
  await writeFile(warningPath, originalArtifact);

  const outsideFile = path.join(temporaryRoot, 'outside.js');
  await writeFile(outsideFile, originalArtifact);
  await rm(warningPath);
  await symlink(outsideFile, warningPath);
  await expectFailure('symlink artifact', () => verify(baseline), /must not contain symlinks/);

  console.log('[firefox-webext-warning-policy-test] all 19 adversarial tests passed');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
