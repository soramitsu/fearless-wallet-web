#!/usr/bin/env node
// Builds the released extension versions listed in tests/upgrade/legacy-builds.json from their own source commit and
// lockfile, so the upgrade E2E starts from profiles the released code wrote (addendum U0.6), not from records this
// tree's libraries produce. Read-only on the repository: each source tree comes from `git archive`.
//
// Every build gets the test manifest key (tests/upgrade/test-extension-key.pub.b64), so all builds share one extension
// id and with it chrome.storage.local, as a Web Store update does, and a placeholder OAuth client id (3.0.x refuses to
// load without one). Results are cached by commit and lockfile hash in $UPGRADE_E2E_CACHE
// (default ~/.cache/fearless-upgrade-e2e/<id>/{build,provenance.json,build.log}).
//
// Usage: node scripts/upgrade-e2e/build-legacy.mjs [--force] [--keep-src] [id ...]
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import { TEST_OAUTH_CLIENT_ID, cacheRoot, legacyBuilds, root, testExtensionKey } from './config.mjs';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const git = (args, options = {}) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 1 << 30, ...options });

/** The build directory and provenance of a cached legacy build, or undefined when it is missing or stale. */
export function cachedBuild(id) {
  const entry = legacyBuilds().find((build) => build.id === id);
  if (!entry) throw new Error(`no legacy build ${id} in tests/upgrade/legacy-builds.json`);
  const dir = path.join(cacheRoot(), id);
  const provenancePath = path.join(dir, 'provenance.json');
  if (!existsSync(provenancePath) || !existsSync(path.join(dir, 'build', 'manifest.json'))) return undefined;
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  if (provenance.commit !== entry.sha) return undefined;
  return { dir: path.join(dir, 'build'), provenance };
}

/** A Node binary of the given major version: $UPGRADE_E2E_NODE<major>_BIN (a bin directory), Homebrew's node@<major>,
 * or the node on PATH when it has that major version. */
export function nodeBinDir(major) {
  const candidates = [
    process.env[`UPGRADE_E2E_NODE${major}_BIN`],
    `/opt/homebrew/opt/node@${major}/bin`,
    `/usr/local/opt/node@${major}/bin`,
    path.dirname(process.execPath),
  ].filter(Boolean);
  for (const dir of candidates) {
    const node = path.join(dir, 'node');
    if (!existsSync(node)) continue;
    const version = execFileSync(node, ['--version'], { encoding: 'utf8' }).trim();
    if (version.startsWith(`v${major}.`)) return { dir, version };
  }
  throw new Error(`Node ${major} not found; set UPGRADE_E2E_NODE${major}_BIN to its bin directory`);
}

function run(command, args, { cwd, env, log }) {
  return new Promise((resolve, reject) => {
    log.write(`\n$ ${command} ${args.join(' ')}\n`);
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with ${code}; see ${log.path}`))));
  });
}

function filesOf(dir, base = dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const file = path.join(dir, name);
      return statSync(file).isDirectory() ? filesOf(file, base) : [{ path: path.relative(base, file), sha256: sha256(readFileSync(file)) }];
    });
}

const lockEntries = (text) => new Set(text.split('\n').filter((line) => line.startsWith('"') && line.endsWith(':')));
function lockEntryDelta(before, after) {
  const [was, now] = [lockEntries(before), lockEntries(after)];
  return { removed: [...was].filter((line) => !now.has(line)), added: [...now].filter((line) => !was.has(line)) };
}

// Replaces a package that can no longer be installed with the stub in scripts/upgrade-e2e/stubs (legacy-builds.json).
function applyStub(src, name) {
  const stubDir = path.join(root, 'scripts/upgrade-e2e/stubs', name.replace(/^@soramitsu\//, ''));
  const target = path.join(src, '.upgrade-e2e-stubs', path.basename(stubDir));
  cpSync(stubDir, target, { recursive: true });
  const packagePath = path.join(src, 'package.json');
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  pkg.resolutions = { ...(pkg.resolutions ?? {}), [name]: `portal:./.upgrade-e2e-stubs/${path.basename(stubDir)}` };
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  return `${name} replaced by scripts/upgrade-e2e/stubs/${path.basename(stubDir)}; install without --immutable`;
}

export async function buildLegacy(entry, { force = false, keepSource = false } = {}) {
  // The pinned commit must be present; where its name resolves too (a clone may lack the hotfix branch), it must agree.
  const sha = git(['rev-parse', '--verify', `${entry.sha}^{commit}`], { encoding: 'utf8' }).trim();
  const named = (() => {
    try {
      return git(['rev-parse', '--verify', '--quiet', `${entry.commit}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return undefined;
    }
  })();
  if (sha !== entry.sha || (named && named !== sha)) throw new Error(`${entry.id}: ${entry.commit} is ${named}, legacy-builds.json pins ${entry.sha}`);
  const cached = cachedBuild(entry.id);
  if (cached && !force) return { ...cached, cached: true };

  const dir = path.join(cacheRoot(), entry.id);
  const src = path.join(dir, 'src');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  const log = createWriteStream(path.join(dir, 'build.log'));
  log.path = path.join(dir, 'build.log');
  try {
    execFileSync('tar', ['-x', '-C', src], { input: git(['archive', '--format=tar', sha]), maxBuffer: 1 << 30 });
    const yarnLock = readFileSync(path.join(src, 'yarn.lock'), 'utf8');
    const yarnLockSha256 = sha256(yarnLock);
    const deviations = entry.stub ? [applyStub(src, entry.stub)] : [];
    const node = nodeBinDir(entry.node);
    const env = {
      ...process.env,
      PATH: `${node.dir}:${process.env.PATH}`,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      COREPACK_ENABLE_STRICT: '0',
      YARN_ENABLE_TELEMETRY: '0',
      YARN_ENABLE_IMMUTABLE_INSTALLS: entry.stub ? 'false' : 'true',
      EXTENSION_PUBLIC_KEY: testExtensionKey(),
      OAUTH_CLIENT_ID: TEST_OAUTH_CLIENT_ID,
      NODE_ENV: undefined,
    };
    delete env.NODE_ENV;
    const yarn = [path.join(node.dir, 'corepack'), `yarn@${entry.yarn}`];
    await run(yarn[0], [yarn[1], 'install', ...(entry.stub ? [] : ['--immutable'])], { cwd: src, env, log });
    await run(yarn[0], [yarn[1], 'build:extension'], { cwd: src, env: { ...env, EXTENSION_TYPE: 'chrome', OUTPUT_DIR: 'chrome' }, log });

    // A stub changes the lockfile: record exactly which entries it touched (only the stubbed package's own tree).
    const lockfileDelta = entry.stub ? lockEntryDelta(yarnLock, readFileSync(path.join(src, 'yarn.lock'), 'utf8')) : undefined;
    const output = path.join(src, 'dist/extension/chrome');
    if (!existsSync(path.join(output, 'manifest.json'))) throw new Error(`${entry.id}: no dist/extension/chrome/manifest.json after the build`);
    const buildDir = path.join(dir, 'build');
    cpSync(output, buildDir, { recursive: true });
    const manifest = JSON.parse(readFileSync(path.join(buildDir, 'manifest.json'), 'utf8'));
    const provenance = {
      id: entry.id,
      commit: sha,
      ref: entry.commit,
      yarnLockSha256,
      manifestVersion: manifest.version,
      node: node.version,
      yarn: entry.yarn,
      install: entry.stub ? 'corepack yarn install (lockfile changed by the stub only)' : 'corepack yarn install --immutable',
      deviations,
      ...(lockfileDelta ? { lockfileDelta } : {}),
      backgroundOnly: !!entry.backgroundOnly,
      extensionKeySha256: sha256(testExtensionKey()),
      builtAt: new Date().toISOString(),
      files: filesOf(buildDir),
    };
    writeFileSync(path.join(dir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
    if (!keepSource) rmSync(src, { recursive: true, force: true });
    return { dir: buildDir, provenance, cached: false };
  } finally {
    log.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const keepSource = args.includes('--keep-src');
  const ids = args.filter((arg) => !arg.startsWith('--'));
  const entries = legacyBuilds().filter(({ id }) => !ids.length || ids.includes(id));
  if (ids.length && entries.length !== ids.length) throw new Error(`unknown build id in ${ids.join(', ')}`);
  let failed = 0;
  for (const entry of entries) {
    const started = Date.now();
    try {
      const { dir, provenance, cached } = await buildLegacy(entry, { force, keepSource });
      console.log(`${entry.id}: ${cached ? 'cached' : 'built'} ${provenance.manifestVersion} from ${provenance.commit.slice(0, 8)} in ${dir} (${Math.round((Date.now() - started) / 1000)} s)`);
    } catch (error) {
      failed += 1;
      console.error(`${entry.id}: FAILED ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
}
