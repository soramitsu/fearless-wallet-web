const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

// Base versions remain vulnerable upstream. These exceptions are valid only
// with the exact reviewed patch, locked selection, and passing runtime probes.
const patches = [
  { name: 'braces', version: '3.0.3', id: '1240992', sha256: '7e4d6d58f5a01f5be947cfdc6deee02b210223a825f9cfa35d5e506e54b35201' },
  { name: 'node-forge', version: '1.4.0', id: '1240912', sha256: '2798686e4488058ad81c3b8e32eb763c0feff21f4c717ce4d13b6ef2432cd5b8' },
];

function auditArguments(manifest, lock, read, production) {
  const args = ['npm', 'audit', '--all', '--recursive', '--severity', 'low', '--no-deprecations'];
  if (production) args.push('--environment', 'production');
  for (const patch of patches) {
    const path = `.yarn/patches/${patch.name}-npm-${patch.version}-security.patch`;
    const locator = `patch:${patch.name}@npm%3A${patch.version}#./${path}`;
    if (manifest.resolutions?.[patch.name] !== locator ||
        !lock.includes(`resolution: "${patch.name}@${locator}::version=${patch.version}&`) ||
        createHash('sha256').update(read(path)).digest('hex') !== patch.sha256) {
      throw new Error(`Security patch proof failed for ${patch.name}; no advisory exception applied`);
    }
    args.push('--ignore', patch.id);
  }
  return args;
}

if (require.main === module) {
  const root = resolve(__dirname, '..');
  try {
    const flags = process.argv.slice(2);
    if (flags.some(flag => flag !== '--production')) throw new Error('Unsupported audit argument');
    if (!process.env.npm_execpath) throw new Error('Run this audit through yarn');
    const read = path => readFileSync(resolve(root, path));
    const args = auditArguments(JSON.parse(read('package.json')), read('yarn.lock').toString(), read, flags.includes('--production'));
    const probes = spawnSync(process.execPath, ['--test', 'scripts/test-dependency-security.cjs'], { cwd: root, stdio: 'inherit' });
    if (probes.status !== 0) throw new Error('Dependency security regression tests failed; no advisory exception applied');
    console.log('Auditing all dependencies; two exact, regression-tested local patches cover upstream base-version alerts (see docs/dependency-security.md).');
    const audit = spawnSync(process.env.npm_execpath, args, { cwd: root, stdio: 'inherit' });
    if (audit.error) throw audit.error;
    process.exitCode = audit.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { auditArguments };
