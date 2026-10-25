import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const installer = join(dirname(fileURLToPath(import.meta.url)), 'install-cft.sh');
const expectedHash = '04883e331b31448d6255fa058f0e1c7e8657c004da1f8a1c04eb28855a37ec6c';
const helper = '/usr/local/libexec/fearless-chrome-147.0.7727.15/chrome-sandbox';

function runInstaller(args, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fearless-cft-install-test-'));
  const bin = join(root, 'bin');
  const log = join(root, 'commands.log');
  const output = join(root, 'github-output');
  mkdirSync(bin);
  writeFileSync(log, '');
  writeFileSync(output, '');
  const shim = (name, source) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\nset -euo pipefail\n${source}\n`, { mode: 0o755 });
  shim('uname', 'printf "%s\\n" "${MOCK_OS:-Linux}"');
  shim('curl', `printf 'curl\\n' >> "$MOCK_LOG"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == --output ]]; then printf 'mock archive' > "$2"; exit 0; fi
  shift
done
exit 1`);
  shim('sha256sum', `printf 'sha256sum\\n' >> "$MOCK_LOG"
printf '%s  %s\\n' "$MOCK_HASH" "$1"`);
  shim('unzip', `printf 'unzip\\n' >> "$MOCK_LOG"
target="$4/chrome-linux64"
mkdir -p "$target"
printf '#!/bin/sh\\nprintf "Chrome for Testing 147.0.7727.15\\\\n"\\n' > "$target/chrome"
chmod +x "$target/chrome"
if [[ "$MOCK_HELPER" == regular ]]; then
  printf 'verified helper fixture' > "$target/chrome_sandbox"
  chmod +x "$target/chrome_sandbox"
elif [[ "$MOCK_HELPER" == symlink ]]; then
  ln -s "$target/chrome" "$target/chrome_sandbox"
fi`);
  // No privilege escalation is executed: this mock only records arguments.
  shim('sudo', `printf 'sudo' >> "$MOCK_LOG"
printf '\\t%s' "$@" >> "$MOCK_LOG"
printf '\\n' >> "$MOCK_LOG"`);
  try {
    const result = spawnSync('bash', [installer, ...args], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: root,
        GITHUB_OUTPUT: output, MOCK_LOG: log, MOCK_HASH: expectedHash, MOCK_HELPER: 'regular', ...overrides },
      encoding: 'utf8', timeout: 5000,
    });
    return { ...result, commands: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean), output: readFileSync(output, 'utf8') };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('privileged helper installation only follows hash verification and extraction of the pinned archive', () => {
  const result = runInstaller(['--install-sandbox']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands.slice(0, 3), ['curl', 'sha256sum', 'unzip']);
  assert.equal(result.commands.length, 5);
  assert.equal(result.commands[3], `sudo\tinstall\t-d\t-o\troot\t-g\troot\t-m\t0755\t${dirname(helper)}`);
  assert.match(result.commands[4], /^sudo\tinstall\t-o\troot\t-g\troot\t-m\t4755\t.*\/chrome-linux64\/chrome_sandbox\t/);
  assert(result.commands[4].endsWith(`\t${helper}`));
  assert(result.output.includes(`sandbox-path=${helper}\n`));
  assert.match(result.output, /chrome-path=.*\/chrome-linux64\/chrome\n/);
});

test('a checksum mismatch cannot extract or install a sandbox helper', () => {
  const result = runInstaller(['--install-sandbox'], { MOCK_HASH: '0'.repeat(64) });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch/);
  assert.deepEqual(result.commands, ['curl', 'sha256sum']);
  assert.equal(result.output, '');
});

test('missing or symlinked archive helpers cannot reach sudo', () => {
  for (const MOCK_HELPER of ['missing', 'symlink']) {
    const result = runInstaller(['--install-sandbox'], { MOCK_HELPER });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no regular executable chrome_sandbox/);
    assert(!result.commands.some((line) => line.startsWith('sudo')));
    assert.equal(result.output, '');
  }
});

test('ordinary installation does not perform privileged operations or expose a helper output', () => {
  const result = runInstaller([]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands, ['curl', 'sha256sum', 'unzip']);
  assert(!result.output.includes('sandbox-path='));
});

test('the privileged option rejects non-Linux hosts before downloading or invoking sudo', () => {
  const result = runInstaller(['--install-sandbox'], { MOCK_OS: 'Darwin' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only supported on the disposable Linux CI runner/);
  assert.deepEqual(result.commands, []);
});

test('unknown installer arguments cannot trigger privileged operations', () => {
  const result = runInstaller(['--install-sandbox', '--unexpected']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage:/);
  assert.deepEqual(result.commands, []);
});
