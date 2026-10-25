import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { environment, resolveManifest, setupRepository, validateManifest } from './setup-workspace.mjs';

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'fearless-workspace-test-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const upstream = path.join(base, 'upstream');
  const root = path.join(base, 'workspace');
  fs.mkdirSync(upstream); fs.mkdirSync(root);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(upstream, 'init', '--initial-branch=reviewed');
  git(upstream, 'config', 'user.name', 'Workspace fixture');
  git(upstream, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(upstream, 'source.txt'), 'pinned source\n');
  git(upstream, 'add', 'source.txt'); git(upstream, 'commit', '-m', 'pin');
  const commit = git(upstream, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(upstream, 'source.txt'), 'newer source\n');
  git(upstream, 'commit', '-am', 'advance upstream');
  const tip = git(upstream, 'rev-parse', 'HEAD');
  const url = path.join(base, 'remote.git');
  git(base, 'clone', '--bare', upstream, url);
  return { base, root, url, git, tip, row: { path: 'application', repository: 'example/application', branch: 'reviewed', commit, group: 'core' } };
}

test('fresh setup pins source even after upstream advances; repeat and offline check are idempotent', (t) => {
  const f = fixture(t);
  assert.equal(setupRepository(f.root, f.row, { url: f.url }), 'cloned');
  const repo = path.join(f.root, f.row.path);
  assert.equal(fs.readFileSync(path.join(repo, 'source.txt'), 'utf8'), 'pinned source\n');
  assert.equal(f.git(repo, 'rev-parse', 'HEAD'), f.row.commit);
  assert.equal(f.git(repo, 'rev-parse', '@{upstream}'), f.tip);
  assert.equal(setupRepository(f.root, f.row, { url: f.url }), 'verified');
  fs.renameSync(f.url, f.url + '.offline');
  assert.equal(setupRepository(f.root, f.row, { checkOnly: true, url: f.url }), 'verified');
});

test('missing checkout check makes no directories', (t) => {
  const f = fixture(t);
  assert.throws(() => setupRepository(f.root, f.row, { checkOnly: true, url: f.url }), /checkout is missing/);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('tracked and untracked local work is never overwritten', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  fs.writeFileSync(path.join(repo, 'source.txt'), 'my changes\n');
  fs.writeFileSync(path.join(repo, 'new.txt'), 'new work\n');
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /local changes/);
  assert.equal(fs.readFileSync(path.join(repo, 'source.txt'), 'utf8'), 'my changes\n');
  assert.equal(fs.readFileSync(path.join(repo, 'new.txt'), 'utf8'), 'new work\n');
  assert.equal(f.git(repo, 'rev-parse', 'HEAD'), f.row.commit);
});

test('a clean checkout at another revision or branch is left alone', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  f.git(repo, 'switch', '-c', 'work-in-progress', f.tip);
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /commit differs/);
  assert.equal(f.git(repo, 'rev-parse', 'HEAD'), f.tip);
  f.git(repo, 'switch', '-c', 'other-branch', f.row.commit);
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /branch differs/);
  assert.equal(f.git(repo, 'branch', '--show-current'), 'other-branch');
});

test('a tag sharing the pinned branch name does not reject the correct checkout', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  f.git(repo, 'tag', f.row.branch);
  assert.equal(setupRepository(f.root, f.row, { checkOnly: true, url: f.url }), 'verified');
  assert.equal(setupRepository(f.root, f.row, { url: f.url }), 'verified');
});

for (const flag of ['--assume-unchanged', '--skip-worktree']) {
  test(`checkout verification rejects source edits hidden by ${flag}`, (t) => {
    const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
    const repo = path.join(f.root, f.row.path);
    f.git(repo, 'update-index', flag, 'source.txt');
    fs.writeFileSync(path.join(repo, 'source.txt'), 'hidden local work\n');
    assert.equal(f.git(repo, 'status', '--porcelain=v1'), '');
    for (const checkOnly of [true, false]) {
      assert.throws(() => setupRepository(f.root, f.row, { checkOnly, url: f.url }),
        /index flags conceal tracked source/);
    }
    assert.equal(fs.readFileSync(path.join(repo, 'source.txt'), 'utf8'), 'hidden local work\n');
    assert.equal(f.git(repo, 'rev-parse', 'HEAD'), f.row.commit);
  });
}

test('offline verification does not refresh or rewrite the Git index', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  const indexPath = path.join(repo, '.git/index');
  const before = fs.readFileSync(indexPath);
  const changedStat = new Date(Date.now() + 60_000);
  fs.utimesSync(path.join(repo, 'source.txt'), changedStat, changedStat);
  assert.equal(setupRepository(f.root, f.row, { checkOnly: true, url: f.url }), 'verified');
  assert.deepEqual(fs.readFileSync(indexPath), before);
});

test('wrong origin, non-repository folders and symlinks are not adopted', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  f.git(repo, 'remote', 'set-url', 'origin', 'https://github.com/other/project.git');
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /origin differs/);
  fs.renameSync(repo, repo + '-retained');
  fs.mkdirSync(repo); fs.writeFileSync(path.join(repo, 'keep'), 'not a checkout');
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /independent Git clone/);
  assert.equal(fs.readFileSync(path.join(repo, 'keep'), 'utf8'), 'not a checkout');
  fs.renameSync(repo, repo + '-ordinary');
  fs.symlinkSync(repo + '-retained', repo, 'dir');
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /real directory/);
});

test('external object stores are rejected to keep clones independent', (t) => {
  const f = fixture(t); setupRepository(f.root, f.row, { url: f.url });
  const repo = path.join(f.root, f.row.path);
  fs.writeFileSync(path.join(repo, '.git/objects/info/alternates'), path.join(f.url, 'objects') + '\n');
  assert.throws(() => setupRepository(f.root, f.row, { url: f.url }), /external Git object store/);
});

test('unavailable revisions and failed fetches clean up temporary clones', (t) => {
  const f = fixture(t);
  assert.throws(() => setupRepository(f.root, { ...f.row, commit: 'a'.repeat(40) }, { url: f.url }), /git cat-file failed/);
  assert.deepEqual(fs.readdirSync(f.root), []);
  assert.throws(() => setupRepository(f.root, f.row, { url: path.join(f.base, 'missing.git') }), /git fetch failed/);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('service clones use a sibling directory only when explicitly selected', (t) => {
  const f = fixture(t);
  const row = { ...f.row, path: '../service', group: 'services' };
  setupRepository(f.root, row, { url: f.url });
  assert.ok(fs.existsSync(path.join(f.base, 'service/.git')));
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('manifest rejects traversal, duplicate directories and invalid refs', () => {
  const row = { path: 'app', repository: 'example/app', branch: 'develop', commit: 'a'.repeat(40), group: 'core' };
  const validate = (rows) => validateManifest({ schemaVersion: 1, repositories: rows });
  for (const invalid of ['../../outside', '/absolute', '../app', '.git', '.', '..']) {
    assert.throws(() => validate([{ ...row, path: invalid }]));
  }
  assert.throws(() => validate([row, { ...row, path: 'APP' }]), /Duplicate/);
  assert.throws(() => validate([{ ...row, branch: 'bad..ref' }]));
  assert.throws(() => validate([{ ...row, commit: 'develop' }]), /full commit/);
  assert.throws(() => validate([{ ...row, group: 'unknown' }]), /Unknown/);
});

test('environment exports preserve spaces and quotes in workspace paths', () => {
  const root = "/tmp/fearless user's workspace";
  const actual = execFileSync('bash', ['-c', environment(root) + '\nprintf "%s\\n%s" "$FEARLESS_ANDROID_PATH" "$FEARLESS_IOS_PATH"'], { encoding: 'utf8' });
  assert.equal(actual, root + '/fearless-Android\n' + root + '/fearless-iOS');
});

function ownerFixture(t) {
  const f = fixture(t);
  const ownerRoot = path.join(f.base, 'owner-source');
  const ownerUrl = path.join(f.base, 'owner.git');
  const relative = 'tools/release-readiness';
  fs.mkdirSync(path.join(ownerRoot, relative, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(ownerRoot, relative, 'config'));
  f.git(ownerRoot, 'init', '--initial-branch=master');
  f.git(ownerRoot, 'config', 'user.name', 'Workspace fixture');
  f.git(ownerRoot, 'config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(ownerRoot, 'source.txt'), 'initial owner\n');
  f.git(ownerRoot, 'add', '.'); f.git(ownerRoot, 'commit', '-m', 'initial owner');
  const initial = f.git(ownerRoot, 'rev-parse', 'HEAD');
  const owner = { path: 'fearless-wallet-web', repository: 'soramitsu/fearless-wallet-web', branch: 'master', commit: 'self', group: 'core' };
  const manifest = { schemaVersion: 1, repositories: [f.row, owner] };
  const manifestPath = path.join(ownerRoot, relative, 'config/workspace-repositories.json');
  fs.copyFileSync(new URL('./setup-workspace.mjs', import.meta.url), path.join(ownerRoot, relative, 'scripts/setup-workspace.mjs'));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, repositories: [{ ...f.row, branch: 'release/retired' }, { ...owner, commit: initial }] }));
  f.git(ownerRoot, 'add', '.'); f.git(ownerRoot, 'commit', '-m', 'old manifest with retired references');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  f.git(ownerRoot, 'commit', '-am', 'self source and current native pin');
  const ownerCommit = f.git(ownerRoot, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(ownerRoot, 'source.txt'), 'newer unselected owner source\n');
  f.git(ownerRoot, 'commit', '-am', 'advance published owner');
  const ownerTip = f.git(ownerRoot, 'rev-parse', 'HEAD');
  f.git(f.base, 'clone', '--bare', ownerRoot, ownerUrl);
  f.git(ownerRoot, 'remote', 'add', 'origin', ownerUrl);
  f.git(ownerRoot, 'reset', '--hard', ownerCommit);
  return { ...f, ownerRoot, ownerUrl, ownerCommit, ownerTip, manifest, relative };
}

test('two-generation bootstrap keeps the invoking owner and its manifest pins; cloned owner checks offline', async (t) => {
  const f = ownerFixture(t);
  const resolved = resolveManifest(f.manifest, f);
  assert.equal(f.manifest.repositories[1].commit, 'self', 'Resolution must not rewrite the committed manifest');
  assert.equal(resolved.repositories[1].commit, f.ownerCommit);
  assert.notEqual(f.ownerCommit, f.ownerTip, 'The remote deliberately advanced beyond the invoking source');
  const urlFor = (row) => row.path === 'fearless-wallet-web' ? f.ownerUrl : f.url;
  for (const row of resolved.repositories) assert.equal(setupRepository(f.root, row, { url: urlFor(row) }), 'cloned');
  const clonedOwner = path.join(f.root, 'fearless-wallet-web');
  assert.equal(f.git(clonedOwner, 'rev-parse', 'HEAD'), f.ownerCommit);
  assert.equal(f.git(clonedOwner, 'rev-parse', '@{upstream}'), f.ownerTip);
  const clonedManifest = JSON.parse(fs.readFileSync(path.join(clonedOwner, f.relative, 'config/workspace-repositories.json'), 'utf8'));
  const clonedScript = await import(pathToFileURL(path.join(clonedOwner, f.relative, 'scripts/setup-workspace.mjs')).href);
  // No ownerRoot override: the cloned script must resolve its own containing repository.
  const repeated = clonedScript.resolveManifest(clonedManifest, { ownerUrl: f.ownerUrl });
  assert.deepEqual(repeated, resolved);
  for (const row of repeated.repositories) assert.equal(clonedScript.setupRepository(f.root, row, { url: urlFor(row) }), 'verified');
  fs.renameSync(f.url, f.url + '.offline'); fs.renameSync(f.ownerUrl, f.ownerUrl + '.offline');
  const offline = clonedScript.resolveManifest(clonedManifest, { ownerUrl: f.ownerUrl });
  for (const row of offline.repositories) assert.equal(clonedScript.setupRepository(f.root, row, { checkOnly: true, url: urlFor(row) }), 'verified');
  assert.equal(f.git(path.join(f.root, f.row.path), 'rev-parse', 'HEAD'), f.row.commit);
  assert.equal(f.git(clonedOwner, 'status', '--porcelain'), '');
});

test('self source is restricted to the actual browser owner and must be resolved before setup', (t) => {
  const f = ownerFixture(t);
  const owner = f.manifest.repositories[1];
  for (const changed of [{ path: 'other' }, { repository: 'other/fearless-wallet-web' }, { group: 'private' }]) {
    assert.throws(() => validateManifest({ schemaVersion: 1, repositories: [{ ...owner, ...changed }] }), /Self source/);
  }
  assert.throws(() => setupRepository(f.root, owner, { url: f.ownerUrl }), /Resolve the self source/);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

for (const hidden of [null, '--assume-unchanged', '--skip-worktree']) {
  test(`self source rejects ${hidden || 'ordinary'} dirty owner before cloning`, (t) => {
    const f = ownerFixture(t);
    if (hidden) f.git(f.ownerRoot, 'update-index', hidden, 'source.txt');
    fs.writeFileSync(path.join(f.ownerRoot, 'source.txt'), 'unreviewed invoking source\n');
    assert.throws(() => resolveManifest(f.manifest, f), hidden ? /index flags conceal/ : /local changes/);
    assert.deepEqual(fs.readdirSync(f.root), []);
    assert.equal(fs.readFileSync(path.join(f.ownerRoot, 'source.txt'), 'utf8'), 'unreviewed invoking source\n');
  });
}

test('self source rejects a mismatched origin, branch or Git root before cloning', (t) => {
  const f = ownerFixture(t);
  f.git(f.ownerRoot, 'remote', 'set-url', 'origin', 'https://github.com/other/project.git');
  assert.throws(() => resolveManifest(f.manifest, f), /origin differs/);
  f.git(f.ownerRoot, 'remote', 'set-url', 'origin', f.ownerUrl);
  f.git(f.ownerRoot, 'switch', '-c', 'unreviewed-branch');
  assert.throws(() => resolveManifest(f.manifest, f), /branch differs/);
  f.git(f.ownerRoot, 'switch', 'master');
  assert.throws(() => resolveManifest(f.manifest, { ownerRoot: path.join(f.ownerRoot, f.relative), ownerUrl: f.ownerUrl }), /independent Git clone/);
  assert.deepEqual(fs.readdirSync(f.root), []);
});

test('fresh self clone rejects a clean invoking commit absent from the declared published branch', (t) => {
  const f = ownerFixture(t);
  f.git(f.ownerRoot, 'commit', '--allow-empty', '-m', 'unpublished local owner');
  const owner = resolveManifest(f.manifest, f).repositories[1];
  assert.throws(() => setupRepository(f.root, owner, { url: f.ownerUrl }), /git cat-file failed/);
  assert.deepEqual(fs.readdirSync(f.root), []);
});
