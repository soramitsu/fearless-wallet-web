// Copyright 2026 Soramitsu Co., Ltd.
// SPDX-License-Identifier: Apache-2.0

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build, version as esbuildVersion } from 'esbuild';
import {
  SAFARI_QA_ASSERTION_INVENTORY_SHA256,
  SAFARI_QA_BUNDLE_BYTES,
  SAFARI_QA_BUNDLE_INPUTS,
  SAFARI_QA_BUNDLE_SHA256,
  SAFARI_QA_CANDIDATE_PACKAGE_INPUTS,
  SAFARI_QA_ESBUILD_VERSION,
  SAFARI_QA_KIND,
  SAFARI_QA_MAX_REPORT_BYTES,
  SAFARI_QA_PACKAGE_NAME,
  SAFARI_QA_PACKAGE_VERSION,
  SAFARI_QA_REPORT_PREFIX,
  SAFARI_QA_SCHEMA_VERSION,
  SAFARI_QA_TAR_SHA256,
  parseAndValidateSafariQaReportText,
  validateSafariQaTimeoutMs,
  waitForSafariQaReport,
} from './iroha-js-candidate-safari-qa-contract.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(SCRIPT_DIR);
const CANDIDATE_DIR = path.join(ROOT_DIR, 'artifacts/iroha-js-candidate/b423c0f8bcd317fd945d6f66ce3fa679401dba7f');
const TARBALL = path.join(CANDIDATE_DIR, 'iroha-iroha-js-0.0.3.tgz');
const VERIFIER = path.join(SCRIPT_DIR, 'verify-iroha-js-candidate.sh');
const ENTRY = path.join(SCRIPT_DIR, 'iroha-js-candidate-safari-qa-entry.mjs');
const CONTROL = path.join(SCRIPT_DIR, 'iroha-js-candidate-safari-control.applescript');
const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 100;

function fail(message) {
  throw new Error(`Iroha Safari QA failed: ${message}`);
}

function parseArguments(argv) {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--timeout-ms') {
      if (index + 1 >= argv.length) fail('--timeout-ms requires an integer value');
      const literal = argv[index + 1];
      if (!/^[0-9]+$/u.test(literal)) fail('--timeout-ms requires an integer value');
      timeoutMs = Number(literal);
      index += 1;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      process.stdout.write('Usage: scripts/run-iroha-js-candidate-safari-qa.sh [--timeout-ms 5000..60000]\n');
      process.exit(0);
    }
    fail(`unknown argument: ${argument}`);
  }
  validateSafariQaTimeoutMs(timeoutMs);
  return { timeoutMs };
}

function rejectUnsafeEnvironment() {
  for (const name of [
    'NODE_OPTIONS',
    'NODE_PATH',
    'npm_config_node_options',
    'NPM_CONFIG_NODE_OPTIONS',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'BASH_ENV',
    'ENV',
  ]) {
    if (process.env[name]) fail(`unsafe runtime environment variable is set: ${name}`);
  }
  const major = Number(process.versions.node.split('.', 1)[0]);
  if (!Number.isSafeInteger(major) || major < 24 || major > 26) {
    fail(`Node 24 through 26 is required; found ${process.versions.node}`);
  }
}

function assertRegularFile(file, context) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    fail(`${context} is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${context} must be a regular non-symlink file`);
  let current = path.resolve(file);
  for (;;) {
    const parent = path.dirname(current);
    if (parent === current) break;
    const parentStat = fs.lstatSync(parent);
    if (parentStat.isSymbolicLink()) {
      const resolved = fs.realpathSync(parent);
      const macOsSystemAlias = ['/etc', '/tmp', '/var'].includes(parent) && resolved === `/private${parent}`;
      if (!macOsSystemAlias) fail(`${context} has a symlinked path component`);
    }
    current = parent;
  }
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: options.maxBuffer ?? 256 * 1024,
    timeout: options.timeout ?? 120_000,
    cwd: options.cwd ?? ROOT_DIR,
    env: options.env ?? process.env,
  });
  if (result.error) fail(`${options.label ?? path.basename(command)} could not run: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostic = `${result.stderr ?? ''}${result.stdout ?? ''}`
      .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
      .slice(0, 2_048);
    fail(`${options.label ?? path.basename(command)} exited ${result.status}: ${diagnostic}`);
  }
  return result.stdout.replace(/[\r\n]+$/u, '');
}

function runAppleScript(operation, url, windowId) {
  const args = [CONTROL, operation, url];
  if (windowId !== undefined) args.push(String(windowId));
  return run('/usr/bin/osascript', args, {
    label: `Safari ${operation}`,
    timeout: 10_000,
    maxBuffer: SAFARI_QA_MAX_REPORT_BYTES + 16 * 1024,
  });
}

function noGlobalBufferMutation(bundleText) {
  const patterns = [
    /(?:globalThis|window|global)(?:\.Buffer|\[["']Buffer["']\])\s*(?:=|\+\+|--)/u,
    /Object\.definePropert(?:y|ies)\s*\(\s*(?:globalThis|window|global)\s*,\s*["']Buffer["']/u,
    /Reflect\.set\s*\(\s*(?:globalThis|window|global)\s*,\s*["']Buffer["']/u,
    /Object\.assign\s*\(\s*(?:globalThis|window|global)\s*,\s*\{[^}]*\bBuffer\s*:/u,
  ];
  return patterns.every((pattern) => !pattern.test(bundleText));
}

async function prepareBundle(tempRoot) {
  assertRegularFile(TARBALL, 'candidate tarball');
  assertRegularFile(VERIFIER, 'candidate verifier');
  assertRegularFile(ENTRY, 'Safari QA entry');
  assertRegularFile(CONTROL, 'Safari control script');
  if (sha256File(TARBALL) !== SAFARI_QA_TAR_SHA256) fail('candidate tar digest does not match');
  run('/bin/bash', [VERIFIER], { label: 'candidate verifier', timeout: 120_000 });

  const extractRoot = path.join(tempRoot, 'extract');
  fs.mkdirSync(extractRoot, { recursive: true, mode: 0o700 });
  run('/usr/bin/tar', ['-xzf', TARBALL, '-C', extractRoot], {
    label: 'candidate extraction',
    timeout: 30_000,
  });
  const extractedPackage = path.join(extractRoot, 'package');
  const packageJsonPath = path.join(extractedPackage, 'package.json');
  assertRegularFile(packageJsonPath, 'extracted candidate package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (packageJson.name !== SAFARI_QA_PACKAGE_NAME || packageJson.version !== SAFARI_QA_PACKAGE_VERSION) {
    fail('extracted candidate package identity does not match');
  }
  const installedPackage = path.join(tempRoot, 'node_modules/@iroha/iroha-js');
  fs.mkdirSync(path.dirname(installedPackage), { recursive: true, mode: 0o700 });
  fs.renameSync(extractedPackage, installedPackage);

  const candidateResolver = {
    name: 'exact-iroha-candidate-resolver',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@iroha\/iroha-js(?:\/|$)/ }, (args) => {
        const suffix = args.path.slice(SAFARI_QA_PACKAGE_NAME.length);
        if (!suffix || !suffix.startsWith('/')) {
          return { errors: [{ text: 'the generic Iroha package root is forbidden in Safari QA' }] };
        }
        const exportKey = `.${suffix}`;
        const definition = packageJson.exports?.[exportKey];
        const selected = typeof definition === 'string' ? definition : (definition?.browser ?? definition?.import);
        if (typeof selected !== 'string' || !selected.startsWith('./')) {
          return { errors: [{ text: `missing browser-safe candidate export: ${exportKey}` }] };
        }
        const resolved = path.resolve(installedPackage, selected);
        if (!resolved.startsWith(`${installedPackage}${path.sep}`)) {
          return { errors: [{ text: `candidate export escapes its package: ${exportKey}` }] };
        }
        return { path: resolved };
      });
    },
  };

  if (esbuildVersion !== SAFARI_QA_ESBUILD_VERSION) {
    fail(`esbuild ${SAFARI_QA_ESBUILD_VERSION} is required; found ${esbuildVersion}`);
  }
  const result = await build({
    entryPoints: [ENTRY],
    absWorkingDir: tempRoot,
    nodePaths: [path.join(ROOT_DIR, 'node_modules')],
    bundle: true,
    write: false,
    platform: 'browser',
    target: ['safari17'],
    format: 'iife',
    conditions: ['browser', 'import', 'default'],
    mainFields: ['browser', 'module', 'main'],
    treeShaking: true,
    sourcemap: false,
    minify: true,
    metafile: true,
    legalComments: 'none',
    logLevel: 'silent',
    plugins: [candidateResolver],
  });
  if (result.outputFiles.length !== 1) fail('Safari bundle produced an unexpected output inventory');
  const bundle = result.outputFiles[0].contents;
  if (bundle.byteLength !== SAFARI_QA_BUNDLE_BYTES) {
    fail(`Safari bundle expected ${SAFARI_QA_BUNDLE_BYTES} bytes, found ${bundle.byteLength}`);
  }
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((input) => /(?:^|[/\\])node:/u.test(input))) {
    fail('Safari bundle resolved a forbidden Node builtin');
  }
  const candidateInputs = inputs.filter((input) => /node_modules[/\\]@iroha[/\\]iroha-js[/\\]/u.test(input)).length;
  if (inputs.length !== SAFARI_QA_BUNDLE_INPUTS) {
    fail(`Safari bundle expected ${SAFARI_QA_BUNDLE_INPUTS} inputs, found ${inputs.length}`);
  }
  if (candidateInputs !== SAFARI_QA_CANDIDATE_PACKAGE_INPUTS) {
    fail(`Safari bundle expected ${SAFARI_QA_CANDIDATE_PACKAGE_INPUTS} candidate inputs, found ${candidateInputs}`);
  }
  const bundleText = Buffer.from(bundle).toString('utf8');
  if (!noGlobalBufferMutation(bundleText)) fail('Safari bundle contains a global Buffer mutation');
  const bundleSha256 = sha256Bytes(bundle);
  if (bundleSha256 !== SAFARI_QA_BUNDLE_SHA256) {
    fail(`Safari bundle digest mismatch: expected ${SAFARI_QA_BUNDLE_SHA256}, found ${bundleSha256}`);
  }
  return {
    bundle,
    bundleSha256,
    inputCount: inputs.length,
    candidateInputCount: candidateInputs,
  };
}

function responseHeaders(contentType, bytes) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Length': String(bytes.byteLength),
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; media-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    Expires: '0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

async function startServer({ bundle, bundleSha256, nonce }) {
  let hostHeader = null;
  let origin = null;
  let indexPath = null;
  let responses = null;
  const server = http.createServer((request, response) => {
    const remote = request.socket.remoteAddress;
    if (remote !== '127.0.0.1' && remote !== '::ffff:127.0.0.1') {
      response.writeHead(403, { 'Content-Length': '0', Connection: 'close' });
      response.end();
      return;
    }
    if (request.headers.host !== hostHeader || request.method !== 'GET') {
      response.writeHead(400, { 'Content-Length': '0', Connection: 'close' });
      response.end();
      return;
    }
    const selected = responses.get(request.url);
    if (!selected) {
      response.writeHead(404, { 'Content-Length': '0', Connection: 'close' });
      response.end();
      return;
    }
    response.writeHead(200, responseHeaders(selected.contentType, selected.body));
    response.end(selected.body);
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxHeadersCount = 32;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string' || address.address !== '127.0.0.1') {
    server.close();
    fail('loopback server did not bind exact IPv4 loopback');
  }
  hostHeader = `127.0.0.1:${address.port}`;
  origin = `http://${hostHeader}`;
  const basePath = `/qa/${nonce}/`;
  indexPath = `${basePath}index.html`;
  const config = {
    schemaVersion: 1,
    nonce,
    origin,
    path: indexPath,
    candidateTarSha256: SAFARI_QA_TAR_SHA256,
    bundleSha256,
    assertionInventorySha256: SAFARI_QA_ASSERTION_INVENTORY_SHA256,
    reportPrefix: SAFARI_QA_REPORT_PREFIX,
  };
  const configJs = Buffer.from(
    `Object.defineProperty(globalThis,"__FEARLESS_IROHA_SAFARI_QA_CONFIG__",{value:Object.freeze(${JSON.stringify(config)}),enumerable:false,configurable:false,writable:false});\n`,
    'utf8'
  );
  const html = Buffer.from(
    [
      '<!doctype html>',
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      `<title>Fearless Iroha Candidate Safari QA ${nonce.slice(0, 12)}</title>`,
      '<style>body{font:14px ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style>',
      '</head><body>Fearless Iroha Safari QA running</body>',
      `<script src="${basePath}config.js" defer></script>`,
      `<script src="${basePath}bundle.js" defer></script>`,
      '</html>',
    ].join(''),
    'utf8'
  );
  responses = new Map([
    [indexPath, { contentType: 'text/html; charset=utf-8', body: html }],
    [`${basePath}config.js`, { contentType: 'text/javascript; charset=utf-8', body: configJs }],
    [`${basePath}bundle.js`, { contentType: 'text/javascript; charset=utf-8', body: Buffer.from(bundle) }],
  ]);
  return { server, origin, indexPath, url: `${origin}${indexPath}` };
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections();
}

async function main() {
  rejectUnsafeEnvironment();
  const { timeoutMs } = parseArguments(process.argv.slice(2));
  if (process.platform !== 'darwin') fail('live QA requires macOS and native Safari');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fearless-iroha-safari-qa-'));
  fs.chmodSync(tempRoot, 0o700);
  let server;
  let safariWindowId;
  let qaUrl;
  let closeError;
  try {
    const prepared = await prepareBundle(tempRoot);
    const nonce = randomBytes(32).toString('hex');
    const started = await startServer({ ...prepared, nonce });
    server = started.server;
    qaUrl = started.url;
    const safariVersion = run('/usr/bin/osascript', ['-e', 'tell application "Safari" to get version'], {
      label: 'Safari version',
      timeout: 10_000,
      maxBuffer: 4_096,
    });
    if (!/^[0-9]+(?:\.[0-9]+){1,3}$/u.test(safariVersion)) fail('Safari returned an invalid version');
    const openedWindow = runAppleScript('open', qaUrl);
    if (!/^[0-9]+$/u.test(openedWindow)) fail('Safari returned an invalid owned window id');
    safariWindowId = Number(openedWindow);
    const reportText = await waitForSafariQaReport(async () => runAppleScript('read', qaUrl, safariWindowId), {
      timeoutMs,
      pollIntervalMs: POLL_INTERVAL_MS,
    });
    const validated = parseAndValidateSafariQaReportText(reportText, {
      nonce,
      origin: started.origin,
      bundleSha256: prepared.bundleSha256,
    });
    runAppleScript('close', qaUrl, safariWindowId);
    safariWindowId = undefined;
    const evidence = {
      schemaVersion: 1,
      kind: 'fearless-iroha-js-candidate-safari-qa-evidence',
      status: 'passed',
      observedAt: new Date().toISOString(),
      candidateTarSha256: SAFARI_QA_TAR_SHA256,
      packageName: SAFARI_QA_PACKAGE_NAME,
      packageVersion: SAFARI_QA_PACKAGE_VERSION,
      assertionInventorySha256: SAFARI_QA_ASSERTION_INVENTORY_SHA256,
      safariVersion,
      nodeVersion: process.versions.node,
      esbuildVersion,
      origin: started.origin,
      nonce,
      bundleSha256: prepared.bundleSha256,
      bundleBytes: prepared.bundle.byteLength,
      bundleInputs: prepared.inputCount,
      candidatePackageInputs: prepared.candidateInputCount,
      scenarioTotal: validated.scenarioTotal,
      assertionTotal: validated.assertionTotal,
      reportSha256: sha256Bytes(Buffer.from(reportText, 'utf8')),
      runtimeReport: validated.report,
    };
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    if (safariWindowId !== undefined && qaUrl) {
      try {
        runAppleScript('close', qaUrl, safariWindowId);
      } catch (error) {
        closeError = error;
      }
    }
    if (server) await closeServer(server);
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (closeError) throw closeError;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'unknown failure';
  process.stderr.write(`${message.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, 4_096)}\n`);
  process.exitCode = 1;
});
