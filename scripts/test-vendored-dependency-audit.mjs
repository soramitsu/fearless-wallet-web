import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { auditVendoredDependencies, loadManifest, verifyCopies } from './audit-vendored-dependencies.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const manifest = loadManifest(read);
const PICOMATCH = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const advisory = (url, overrides = {}) => ({
  id: 1247710, url, title: 'fixture advisory', severity: 'high', vulnerable_versions: '<=4.0.7', ...overrides,
});
function fixture({ bulk = {}, status = 200, files = {} } = {}) {
  const payloads = [];
  const lines = [];
  return {
    payloads,
    lines,
    options: {
      read: (path) => (Object.hasOwn(files, path) ? Buffer.from(files[path]) : read(path)),
      log: (line) => lines.push(line),
      async fetchRegistry(url, init) {
        assert.equal(url, 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk');
        assert.equal(init.method, 'POST');
        payloads.push(JSON.parse(init.body));
        return { ok: status === 200, status, json: async () => bulk };
      },
    },
  };
}

test('the manifest lists the vendored braces and picomatch copies and their reviewed advisories', () => {
  assert.deepEqual(Object.keys(manifest).sort(), ['braces', 'picomatch']);
  assert.deepEqual(manifest.picomatch.copies, { 'vendor/picomatch-2': '2.3.2', 'vendor/picomatch-4': '4.0.7' });
  assert.deepEqual(manifest.picomatch.reviewedAdvisories, [PICOMATCH]);
  assert.deepEqual(manifest.braces.copies, { 'vendor/braces': '3.0.3' });
  assert.doesNotThrow(() => verifyCopies(manifest, read));
});

test('npm is asked about the upstream versions, and only the reviewed advisory of an intact copy passes', async () => {
  const ok = fixture({ bulk: { picomatch: [advisory(PICOMATCH)] } });
  assert.equal(await auditVendoredDependencies(ok.options), 0);
  assert.deepEqual(ok.payloads, [{ braces: ['3.0.3'], picomatch: ['2.3.2', '4.0.7'] }]);
  assert.match(ok.lines.at(-1), /0 unreviewed advisories; 1 guarded/);
  assert.equal(await auditVendoredDependencies(fixture().options), 0);
});

test('any other advisory on a vendored copy fails the audit', async () => {
  for (const bulk of [
    { picomatch: [advisory('https://github.com/advisories/GHSA-future-advisory')] },
    { picomatch: [advisory(PICOMATCH), advisory('https://github.com/advisories/GHSA-future-advisory')] },
    { braces: [advisory('https://github.com/advisories/GHSA-future-advisory')] },
    { braces: [advisory(PICOMATCH)] },
  ]) {
    assert.equal(await auditVendoredDependencies(fixture({ bulk }).options), 1, JSON.stringify(bulk));
  }
});

test('the exemption needs the reviewed guard: a changed guarded file or a different copy stops the audit', async () => {
  const guarded = Object.keys(manifest.picomatch.guardedFiles)[0];
  const changed = fixture({ bulk: { picomatch: [advisory(PICOMATCH)] }, files: { [guarded]: `${read(guarded)}\n// edited\n` } });
  await assert.rejects(auditVendoredDependencies(changed.options), /Guarded file changed without review/);
  assert.deepEqual(changed.payloads, []);
  const renumbered = fixture({ files: { 'vendor/picomatch-4/package.json': JSON.stringify({ name: 'picomatch', version: '4.0.8' }) } });
  await assert.rejects(auditVendoredDependencies(renumbered.options), /is not picomatch@4.0.7/);
  const braces = Object.keys(manifest.braces.guardedFiles)[0];
  await assert.rejects(auditVendoredDependencies(fixture({ files: { [braces]: 'module.exports = {};' } }).options), /Guarded file changed/);
});

test('the audit fails closed on registry errors and malformed responses', async () => {
  await assert.rejects(auditVendoredDependencies(fixture({ status: 503 }).options), /HTTP 503/);
  for (const bulk of [
    [], null, 'x', { unexpected: [] }, { picomatch: {} }, { picomatch: [null] },
    ...['id', 'url', 'title', 'severity', 'vulnerable_versions'].map((field) => {
      const value = advisory(PICOMATCH);
      delete value[field];
      return { picomatch: [value] };
    }),
    { picomatch: [advisory(PICOMATCH, { severity: 'unknown' })] },
  ]) {
    await assert.rejects(auditVendoredDependencies(fixture({ bulk }).options), /Unexpected vendored dependency advisory/, JSON.stringify(bulk));
  }
  for (const bad of ['{}', '[]', JSON.stringify({ picomatch: { copies: {}, guardedFiles: {}, reviewedAdvisories: [] } }),
    JSON.stringify({ picomatch: { copies: { 'vendor/picomatch-4': '4.0.7' }, guardedFiles: { 'x': 'y' }, reviewedAdvisories: ['https://example.com/x'] } })]) {
    await assert.rejects(auditVendoredDependencies(fixture({ files: { 'config/vendored-dependency-advisories.json': bad } }).options), /Unexpected vendored dependency manifest/);
  }
});
