import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

export const FIREFOX_WARNING_POLICY_SCHEMA_VERSION = 1;

const REVIEWED_WARNING_CODES = new Set(['DANGEROUS_EVAL', 'UNSAFE_VAR_ASSIGNMENT']);

function fail(message) {
  throw new Error(`[firefox-webext-warning-policy] ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${label} keys must be exactly ${expected.join(', ')}`);
  }
}

function assertSafeRelativeFile(value, label) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 512 ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === '..' ||
    value.startsWith('../')
  ) {
    fail(`${label} must be a canonical relative POSIX path`);
  }
}

function assertSha256(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertBoundedString(value, label, maximumLength) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength || /[\0\r]/.test(value)) {
    fail(`${label} must be a non-empty bounded string without control delimiters`);
  }
}

function canonicalWarning(warning, index) {
  if (!isPlainObject(warning)) {
    fail(`warning ${index} must be an object`);
  }
  const { code, message, description, file, line, column } = warning;
  if (!REVIEWED_WARNING_CODES.has(code)) {
    fail(`warning ${index} has unreviewed code ${String(code)}`);
  }
  assertBoundedString(message, `warning ${index} message`, 512);
  assertBoundedString(description, `warning ${index} description`, 2_048);
  assertSafeRelativeFile(file, `warning ${index} file`);
  if (!Number.isSafeInteger(line) || line < 1 || line > 10_000_000) {
    fail(`warning ${index} line must be a positive bounded integer`);
  }
  if (!Number.isSafeInteger(column) || column < 1 || column > 100_000_000) {
    fail(`warning ${index} column must be a positive bounded integer`);
  }
  return { code, message, description, file, line, column };
}

function compareWarnings(left, right) {
  return (
    left.file.localeCompare(right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message) ||
    left.description.localeCompare(right.description)
  );
}

function canonicalWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    fail('lint warnings must be an array');
  }
  return warnings.map(canonicalWarning).sort(compareWarnings);
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function warningSetDigest(warnings) {
  return sha256(`${JSON.stringify(canonicalWarnings(warnings))}\n`);
}

function countBy(values, selector) {
  const counts = new Map();
  for (const value of values) {
    const key = selector(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function assertCanonicalCountMap(value, expected, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
  for (const [key, count] of Object.entries(value)) {
    assertBoundedString(key, `${label} key`, 512);
    if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) {
      fail(`${label}.${key} must be a positive bounded integer`);
    }
  }
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    fail(`${label} does not match the current lint warning set`);
  }
}

async function assertRegularFileInsideRoot(root, relativeFile) {
  const rootStat = await lstat(root);
  if (rootStat.isSymbolicLink()) {
    fail('warning artifact source directory must not be a symlink');
  }
  if (!rootStat.isDirectory()) {
    fail('warning artifact source root must be a directory');
  }
  const rootReal = await realpath(root);
  const segments = relativeFile.split('/');
  let cursor = rootReal;
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = await lstat(cursor);
    if (stat.isSymbolicLink()) {
      fail(`warning artifact path must not contain symlinks: ${relativeFile}`);
    }
  }
  const fileReal = await realpath(cursor);
  if (!fileReal.startsWith(`${rootReal}${path.sep}`)) {
    fail(`warning artifact escapes source directory: ${relativeFile}`);
  }
  const stat = await lstat(fileReal);
  if (!stat.isFile()) {
    fail(`warning artifact must be a regular file: ${relativeFile}`);
  }
  return fileReal;
}

function validateLintResult(lintResult) {
  if (!isPlainObject(lintResult)) {
    fail('web-ext lint output must be an object');
  }
  if (!Array.isArray(lintResult.errors) || lintResult.errors.length !== 0) {
    fail('web-ext lint errors are forbidden');
  }
  if (!Array.isArray(lintResult.notices) || lintResult.notices.length !== 0) {
    fail('web-ext lint notices require explicit review and are forbidden');
  }
  if (!Array.isArray(lintResult.warnings) || lintResult.warnings.length > 100_000) {
    fail('web-ext lint warnings must be a bounded array');
  }
  const warnings = canonicalWarnings(lintResult.warnings);
  if (
    !Number.isSafeInteger(lintResult.count) ||
    lintResult.count !== warnings.length ||
    !isPlainObject(lintResult.summary) ||
    lintResult.summary.errors !== 0 ||
    lintResult.summary.notices !== 0 ||
    lintResult.summary.warnings !== warnings.length
  ) {
    fail('web-ext lint summary/count is inconsistent with its findings');
  }
  return warnings;
}

export async function createFirefoxWarningBaseline({ lintResult, sourceDir, sourceDirLabel, webExtVersion }) {
  assertBoundedString(webExtVersion, 'webExtVersion', 64);
  assertSafeRelativeFile(sourceDirLabel, 'sourceDirLabel');
  const warnings = validateLintResult(lintResult);
  const warningFiles = countBy(warnings, (warning) => warning.file);
  const artifacts = [];
  for (const file of Object.keys(warningFiles)) {
    const absoluteFile = await assertRegularFileInsideRoot(sourceDir, file);
    artifacts.push({
      file,
      sha256: sha256(await readFile(absoluteFile)),
    });
  }
  return {
    schemaVersion: FIREFOX_WARNING_POLICY_SCHEMA_VERSION,
    webExtVersion,
    sourceDir: sourceDirLabel,
    warningCount: warnings.length,
    warningCodes: countBy(warnings, (warning) => warning.code),
    warningFiles,
    warningSetSha256: warningSetDigest(warnings),
    artifacts,
  };
}

export async function verifyFirefoxWarningBaseline({ baseline, lintResult, sourceDir, sourceDirLabel, webExtVersion }) {
  assertExactKeys(
    baseline,
    [
      'schemaVersion',
      'webExtVersion',
      'sourceDir',
      'warningCount',
      'warningCodes',
      'warningFiles',
      'warningSetSha256',
      'artifacts',
    ],
    'baseline'
  );
  if (baseline.schemaVersion !== FIREFOX_WARNING_POLICY_SCHEMA_VERSION) {
    fail(`baseline schemaVersion must be ${FIREFOX_WARNING_POLICY_SCHEMA_VERSION}`);
  }
  if (baseline.webExtVersion !== webExtVersion) {
    fail(`baseline webExtVersion must match installed web-ext ${webExtVersion}`);
  }
  if (baseline.sourceDir !== sourceDirLabel) {
    fail(`baseline sourceDir must be ${sourceDirLabel}`);
  }
  if (!Number.isSafeInteger(baseline.warningCount) || baseline.warningCount < 0 || baseline.warningCount > 100_000) {
    fail('baseline warningCount must be a bounded non-negative safe integer');
  }
  assertSha256(baseline.warningSetSha256, 'baseline warningSetSha256');

  const warnings = validateLintResult(lintResult);
  if (baseline.warningCount !== warnings.length) {
    fail(`warning count drifted: expected ${baseline.warningCount}, received ${warnings.length}`);
  }
  assertCanonicalCountMap(
    baseline.warningCodes,
    countBy(warnings, (warning) => warning.code),
    'baseline warningCodes'
  );
  const warningFiles = countBy(warnings, (warning) => warning.file);
  assertCanonicalCountMap(baseline.warningFiles, warningFiles, 'baseline warningFiles');
  const actualWarningDigest = warningSetDigest(warnings);
  if (baseline.warningSetSha256 !== actualWarningDigest) {
    fail('warning fingerprint digest drifted; review the exact new lint findings');
  }

  if (!Array.isArray(baseline.artifacts)) {
    fail('baseline artifacts must be an array');
  }
  const expectedFiles = Object.keys(warningFiles);
  const actualFiles = [];
  for (let index = 0; index < baseline.artifacts.length; index += 1) {
    const artifact = baseline.artifacts[index];
    assertExactKeys(artifact, ['file', 'sha256'], `baseline artifact ${index}`);
    assertSafeRelativeFile(artifact.file, `baseline artifact ${index} file`);
    assertSha256(artifact.sha256, `baseline artifact ${index} sha256`);
    actualFiles.push(artifact.file);
  }
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail('baseline artifacts must list every warning-bearing file exactly once in canonical order');
  }
  for (const artifact of baseline.artifacts) {
    const absoluteFile = await assertRegularFileInsideRoot(sourceDir, artifact.file);
    const actualDigest = sha256(await readFile(absoluteFile));
    if (artifact.sha256 !== actualDigest) {
      fail(`warning-bearing artifact digest drifted: ${artifact.file}`);
    }
  }

  return {
    warningCount: warnings.length,
    warningCodes: baseline.warningCodes,
    warningSetSha256: actualWarningDigest,
  };
}
