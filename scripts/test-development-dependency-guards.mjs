import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const braces = require('braces');
const forge = require('node-forge');
let checks = 0;
function check(name, action) {
  action();
  checks++;
  console.log(`PASS ${name}`);
}

// Verify executable installed sources, including direct lib entrypoints.
for (const name of ['braces', 'node-forge', 'minimatch']) {
  const installed = path.dirname(require.resolve(`${name}/package.json`));
  const vendored = path.join(root, 'vendor', name);
  function compare(directory = '') {
    for (const entry of readdirSync(path.join(vendored, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) compare(relative);
      else if (/\.(?:[cm]?js|json|d\.ts)$/.test(entry.name)) {
        check(`${name} installed source ${relative}`, () => assert.deepEqual(
          readFileSync(path.join(installed, relative)), readFileSync(path.join(vendored, relative)),
        ));
      }
    }
  }
  compare();
}

check('normal brace expansion and numeric ranges', () => assert.deepEqual(
  braces.expand('src/{a,b}/{1..3}.ts'),
  ['src/a/1.ts', 'src/a/2.ts', 'src/a/3.ts', 'src/b/1.ts', 'src/b/2.ts', 'src/b/3.ts'],
));
check('normal nested expansion', () => assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']));
check('escaped braces stay literal', () => assert.deepEqual(braces.expand('a/\\{b,c\\}'), ['a/{b,c}']));
check('normal regex compilation', () => assert.equal(braces.compile('src/{a,b}.ts'), 'src/(a|b).ts'));
check('AST roundtrip', () => assert.equal(braces.stringify(braces.parse('src/{a,b}.ts')), 'src/{a,b}.ts'));
check('moderate nesting remains supported', () => assert.equal(braces.stringify('{'.repeat(20) + 'x' + '}'.repeat(20)), '{'.repeat(20) + 'x' + '}'.repeat(20)));
check('micromatch brace consumer', () => assert.deepEqual(require('micromatch')(['a.ts', 'b.js', 'c.css'], '*.{ts,js}'), ['a.ts', 'b.js']));
check('fast-glob brace consumer', () => assert.deepEqual(require('fast-glob').sync('vendor/node-forge/{index.cjs,package.json}', { cwd: root }).sort(), ['vendor/node-forge/index.cjs', 'vendor/node-forge/package.json']));

const depthError = { name: 'RangeError', message: /safe depth limit/ };
const patterns = [
  '{'.repeat(4000) + 'x' + '}'.repeat(4000),
  '('.repeat(4000) + 'x' + ')'.repeat(4000),
  '{'.repeat(4000) + 'x',
];
const stringEntries = {
  main: braces, create: braces.create, parse: braces.parse, compile: braces.compile,
  expand: braces.expand, stringify: braces.stringify, 'lib/parse': require('braces/lib/parse'),
};
for (const [name, operation] of Object.entries(stringEntries)) {
  for (const [index, pattern] of patterns.entries()) {
    check(`${name} rejects nested input ${index} before recursion`, () => assert.throws(() => operation(pattern), depthError));
  }
}
check('maxLength cannot disable the depth guard', () => assert.throws(() => braces.parse(patterns[0], { maxLength: Infinity }), depthError));

function deepAst() {
  const ast = { type: 'root', nodes: [] };
  let node = ast;
  for (let index = 0; index < 4000; index++) {
    const child = { type: 'brace', nodes: [] };
    node.nodes.push(child);
    node = child;
  }
  return ast;
}
const astEntries = {
  compile: braces.compile, expand: braces.expand, stringify: braces.stringify,
  'lib/compile': require('braces/lib/compile'), 'lib/expand': require('braces/lib/expand'),
  'lib/stringify': require('braces/lib/stringify'),
};
function externalQueueAst(queue) {
  const parent = { type: 'root', queue };
  return { type: 'root', nodes: [{ type: 'paren', parent, nodes: [{ type: 'text', value: 'x' }] }] };
}
for (const [name, operation] of Object.entries(astEntries)) {
  check(`${name} rejects cyclic value arrays`, () => {
    const value = [];
    value.push(value);
    assert.throws(() => operation({ type: 'root', nodes: [{ type: 'text', value }] }), /Expected a string brace AST value/);
  });
  check(`${name} rejects deeply nested value arrays`, () => {
    let value = ['x'];
    for (let index = 0; index < 4000; index++) value = [value];
    assert.throws(() => operation({ type: 'root', nodes: [{ type: 'text', value }] }), /Expected a string brace AST value/);
  });
  check(`${name} rejects deeply nested direct AST`, () => assert.throws(() => operation(deepAst()), depthError));
  check(`${name} rejects cyclic child AST`, () => {
    const ast = { type: 'root', nodes: [] };
    ast.nodes.push(ast);
    assert.throws(() => operation(ast), /Cyclic or shared brace AST/);
  });
  check(`${name} rejects cyclic parent AST`, () => {
    const ast = { type: 'root', nodes: [] };
    ast.parent = ast;
    assert.throws(() => operation(ast), depthError);
  });
  check(`${name} rejects excessive AST width`, () => assert.throws(
    () => operation({ type: 'root', nodes: Array.from({ length: 65537 }, () => ({ type: 'text', value: 'x' })) }), /safe node limit/,
  ));
  check(`${name} rejects cyclic node queues`, () => {
    const queue = [];
    queue.push(queue);
    assert.throws(() => operation({ type: 'root', nodes: [], queue }), /Cyclic brace expansion queues/);
  });
  check(`${name} rejects cyclic queues on external parents`, () => {
    const cyclic = [];
    cyclic.push(cyclic);
    assert.throws(() => operation(externalQueueAst([cyclic])), /Cyclic brace expansion queues/);
  });
  check(`${name} rejects deeply nested queues on external parents`, () => {
    let queue = ['x'];
    for (let index = 0; index < 4000; index++) queue = [queue];
    assert.throws(() => operation(externalQueueAst(queue)), depthError);
  });
  check(`${name} rejects non-string queue leaves on external parents`, () => assert.throws(
    () => operation(externalQueueAst([{}])), /Expected brace queue strings or arrays/,
  ));
  check(`${name} rejects excessive queue width on external parents`, () => assert.throws(
    () => operation(externalQueueAst(Array(65537).fill('x'))), /safe node limit/,
  ));
  check(`${name} rechecks cached queue roots at their nested depth`, () => {
    const queue = ['x'];
    let nested = queue;
    for (let index = 0; index < 128; index++) nested = [nested];
    const ast = externalQueueAst(nested);
    ast.queue = queue;
    assert.throws(() => operation(ast), depthError);
  });
}
check('expanded parser AST remains reusable by stringify', () => {
  const ast = braces.parse('src/{a,b}.ts');
  assert.deepEqual(braces.expand(ast), ['src/a.ts', 'src/b.ts']);
  assert.equal(braces.stringify(ast), 'src/{a,b}.ts');
});
check('shared bounded queue arrays and reused parent queues remain supported', () => {
  const shared = ['x'];
  const queue = [shared, shared];
  const parent = { type: 'root', queue };
  const ast = { type: 'root', queue, nodes: [{ type: 'text', value: 'x', parent }, { type: 'text', value: 'y', parent }] };
  assert.equal(braces.compile(ast), 'xy');
});
check('non-array expansion queue is rejected', () => assert.throws(
  () => braces.expand({ type: 'root', nodes: [], queue: 'x' }), /Expected a brace expansion queue/,
));

const disabled = /Android ADB cryptography is disabled/;
for (const [name, operation] of Object.entries({
  integer: () => new forge.jsbn.BigInteger('01', 16),
  rsaPublicKey: () => forge.pki.rsa.setPublicKey({}, {}),
  rsaKeyGeneration: () => forge.pki.rsa.generateKeyPair(),
  publicPem: () => forge.pki.publicKeyFromPem(''),
  privatePem: () => forge.pki.privateKeyFromPem(''),
  decryptPem: () => forge.pki.decryptRsaPrivateKey('', ''),
  md5: () => forge.md.md5.create(),
})) check(`ADB ${name} fails closed`, () => assert.throws(operation, disabled));
check('ADB module still loads for desktop web-ext', () => assert.equal(typeof require('@devicefarmer/adbkit').default.createClient, 'function'));
check('real ADB public key parser cannot reach RSA verification', () => {
  const struct = Buffer.alloc(524);
  struct.writeUInt32LE(64, 0);
  struct.writeUInt32LE(65537, 520);
  assert.throws(() => require('@devicefarmer/adbkit/dist/src/adb/auth').default.readPublicKeyFromStruct(struct, 'test'), disabled);
});

// minimatch resolves to vendor/minimatch: the patched upstream 11.0.3, with the removed makeRe kept as a refusing stub.
const minimatchModule = require('minimatch');
const minimatchEsm = await import('minimatch');
check('minimatch wraps the patched upstream 11.0.3', () => assert.equal(require('minimatch-upstream/package.json').version, '11.0.3'));
check('minimatch matches through its CommonJS and ES module entries', () => {
  assert.equal(minimatchModule.minimatch('src/a/b.ts', 'src/**/*.ts'), true);
  assert.equal(new minimatchModule.Minimatch('*.js').match('a.ts'), false);
  assert.equal(minimatchEsm.minimatch('src/a.ts', 'src/*.ts'), true);
});
for (const [name, makeRe] of Object.entries({ commonjs: minimatchModule.makeRe, esm: minimatchEsm.makeRe })) {
  check(`minimatch ${name} makeRe fails closed`, () => assert.throws(() => makeRe('*.js'), /no longer builds regular expressions/));
}
const { default: multimatch } = await import('multimatch');
check('multimatch consumer', () => assert.deepEqual(multimatch(['a.js', 'b.map', 'c/d.js'], ['**/*.js']), ['a.js', 'c/d.js']));
const importX = await import('eslint-plugin-import-x');
check('eslint-plugin-import-x loads with minimatch 11', () => assert.equal(typeof importX.default.rules.order.create, 'function'));

// picomatch resolves to vendor/picomatch-2 and vendor/picomatch-4: upstream 2.3.2 and 4.0.7 with a guard for
// GHSA-fc5q-39xc-vjpf, which no upstream release fixes: a `+(...)` or `*(...)` extglob whose body is not a plain
// sequence of literal characters and single-character classes is emitted as a literal string.
const picomatchLines = {
  2: {
    version: '2.3.2',
    upstream: {
      'index.js': '5695ff5dfcd5a338a40630bd506056f2950bcb08fe1cc068519cbbfe60add480',
      'lib/constants.js': '980225ab847a88a784f6d315557b8434f7742b2551ce20e354455c61b938c0a5',
      'lib/parse.js': '3a91656f440069aa8f8e15c9d695b9f6b2209df1eab2be8127c72cbcca45ff5f',
      'lib/picomatch.js': '2cb169cbe17d356036c5f62a377318b85e30817877e59797842aec9d8b15f54b',
      'lib/scan.js': '227fcc994a477ea95c5a0435d32783566334c6bd0dcc4a103029735ad8c9c535',
      'lib/utils.js': '809fc29cf35ab0aa76b99cad29182f62c0ae598902481d10f9868eaef71981ee',
      'LICENSE': 'd0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9',
    },
  },
  4: {
    version: '4.0.7',
    upstream: {
      'index.js': '02ae26406508e28f9ba0865be16cf77f0b33de6c4d4d49c212c4176df1d5625a',
      'lib/constants.js': 'c28f952d2758261fe5428a121add485cc25b03e0193633f649de903dc0e5e222',
      'lib/parse.js': '4e1e05447668aa1e94366c5516a2bcd8f5fff800cc92b1d0cd7d77703b8618c4',
      'lib/picomatch.js': 'fdd249d7ffff853f3bb1c77eafc8baa1a437bea85a94c35877b83c6a40d9ca94',
      'lib/scan.js': '6457a1764e5c2e543cc3a0c00ce12ebb3764097628868198370b64d4e642aaae',
      'lib/utils.js': 'f04604f70cd1a3f6ace80b84766468674ff38b4bb83818d2ef1d81fc6355f935',
      'posix.js': '5695ff5dfcd5a338a40630bd506056f2950bcb08fe1cc068519cbbfe60add480',
      'LICENSE': 'd0cd141b0c322fded5dfad1d4645bb2fedfc05b7321fe1009469638190d59ef9',
    },
  },
};
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const withoutGuard = (source) => source.replace(/[ \t]*\/\/ fearless-guard:start[\s\S]*?\/\/ fearless-guard:end\n\n/g, '');
for (const [line, { version, upstream }] of Object.entries(picomatchLines)) {
  const vendored = path.join(root, 'vendor', `picomatch-${line}`);
  const listed = (directory = '') => readdirSync(path.join(vendored, directory), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listed(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
  check(`picomatch ${version} vendors exactly the upstream files`, () => assert.deepEqual(
    listed().sort(), [...Object.keys(upstream), 'README.md', 'package.json'].sort(),
  ));
  for (const [file, digest] of Object.entries(upstream)) {
    const source = readFileSync(path.join(vendored, file), 'utf8');
    check(`picomatch ${version} ${file} is upstream${file === 'lib/parse.js' ? ' outside the guard' : ''}`, () => {
      assert.equal(sha256(file === 'lib/parse.js' ? withoutGuard(source) : source), digest);
      assert.equal(source.includes('fearless-guard'), file === 'lib/parse.js');
    });
  }
  check(`picomatch ${version} keeps upstream's version, license and name`, () => {
    const manifest = JSON.parse(readFileSync(path.join(vendored, 'package.json'), 'utf8'));
    assert.deepEqual([manifest.name, manifest.version, manifest.license, manifest.private], ['picomatch', version, 'MIT', true]);
  });
}

// Every installed picomatch package, hoisted or nested, must be one of the two vendored copies: a new range that no
// resolution covers would otherwise bring the unguarded registry package back. Copies bundled inside another
// package's files (rollup, prettier) are not packages and cannot be resolved; docs/dependency-audit-exceptions.md
// lists them.
function installedPackages(name, directory = path.join(root, 'node_modules')) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packages = entry.name.startsWith('@')
      ? readdirSync(path.join(directory, entry.name)).map((scoped) => path.join(entry.name, scoped))
      : [entry.name];
    for (const packageName of packages) {
      const location = path.join(directory, packageName);
      if (packageName === name) found.push(location);
      if (existsSync(path.join(location, 'node_modules'))) found.push(...installedPackages(name, path.join(location, 'node_modules')));
    }
  }
  return found;
}
const installedPicomatch = installedPackages('picomatch');
check('both picomatch lines are installed as packages', () => assert.deepEqual(
  [...new Set(installedPicomatch.map((location) => JSON.parse(readFileSync(path.join(location, 'package.json'), 'utf8')).version))].sort(),
  Object.values(picomatchLines).map(({ version }) => version).sort(),
));
for (const location of installedPicomatch) {
  const { version } = JSON.parse(readFileSync(path.join(location, 'package.json'), 'utf8'));
  const [line] = Object.entries(picomatchLines).find(([, entry]) => entry.version === version) ?? [];
  const vendored = path.join(root, 'vendor', `picomatch-${line}`);
  check(`installed package ${path.relative(root, location)} is the guarded ${version}`, () => {
    for (const file of [...Object.keys(picomatchLines[line].upstream), 'package.json']) {
      assert.deepEqual(readFileSync(path.join(location, file)), readFileSync(path.join(vendored, file)), file);
    }
  });
}

// [pattern, input, expected, options]: what upstream 2.3.2 and 4.0.7 both answer, unchanged by the guard.
const ordinaryMatches = [
  ['*.js','a.js',true],
  ['*.js','a.ts',false],
  ['*.js','.a.js',false],
  ['*.js','dir/a.js',false],
  ['**/*.vue','App.vue',true],
  ['**/*.vue','src/screens/wallet&asset/TransferForm.vue',true],
  ['**/*.vue','src/a.ts',false],
  ['**/*.vue','src/.hidden/a.vue',false],
  ['src/**/*.{ts,tsx,vue}','src/main.ts',true],
  ['src/**/*.{ts,tsx,vue}','src/a/b/c.vue',true],
  ['src/**/*.{ts,tsx,vue}','src/a.js',false],
  ['src/**/*.{ts,tsx,vue}','tests/a.ts',false],
  ['**/node_modules/**','node_modules/a/index.js',true],
  ['**/node_modules/**','src/node_modules/b.js',true],
  ['**/node_modules/**','src/a.js',false],
  ['!**/node_modules/**','node_modules/a/index.js',false],
  ['!**/node_modules/**','src/a.js',true],
  ['**/*.d.ts','src/a.d.ts',true],
  ['**/*.d.ts','src/a.ts',false],
  ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}','tests/unit/a.spec.ts',true],
  ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}','tests/unit/a.ts',false],
  ['tests/**/*.{test,spec}.{js,ts,jsx,tsx}','tests/a.test.jsx',true],
  ['src/**/*.{js,jsx,vue,ts,tsx}','src/a.vue',true],
  ['src/**/*.{js,jsx,vue,ts,tsx}','src/a.d.ts',true],
  ['src/**/*.{js,jsx,vue,ts,tsx}','src/a.css',false],
  ['a/b/*','a/b/c',true],
  ['a/b/*','a/b/c/d',false],
  ['a/b/*','a/b',false],
  ['?.js','a.js',true],
  ['?.js','ab.js',false],
  ['[abc].js','a.js',true],
  ['[abc].js','d.js',false],
  ['[!a].js','a.js',true],
  ['[!a].js','b.js',false],
  ['{a,b}/*.ts','a/x.ts',true],
  ['{a,b}/*.ts','c/x.ts',false],
  ['file-[0-9].txt','file-1.txt',true],
  ['file-[0-9].txt','file-a.txt',false],
  ['**','a',true],
  ['**','a/b/c',true],
  ['**','.a',false],
  ['*','a',true],
  ['*','a/b',false],
  ['*','.a',false],
  ['@(a|b).js','a.js',true],
  ['@(a|b).js','b.js',true],
  ['@(a|b).js','c.js',false],
  ['@(a|b).js','ab.js',false],
  ['?(a).js','.js',true],
  ['?(a).js','a.js',true],
  ['?(a).js','aa.js',false],
  ['!(*.d).ts','a.ts',true],
  ['!(*.d).ts','a.d.ts',false],
  ['!(a|b)','a',false],
  ['!(a|b)','b',false],
  ['!(a|b)','c',true],
  ['+(a|b)','abc',false],
  ['+(a|b)','',false],
  ['*(a|b)c','abd',false],
  ['+([0-9])','123',true],
  ['+([0-9])','12a',false],
  ['*([a-z]).txt','abc.txt',true],
  ['*([a-z]).txt','.txt',true],
  ['*([a-z]).txt','a1.txt',false],
  ['+(ab)','abab',true],
  ['+(ab)','aba',false],
  ['+(abc)','abcabc',true],
  ['+(abc)','abcab',false],
  ['@(*.js|*.ts)','a.js',true],
  ['@(*.js|*.ts)','a.ts',true],
  ['@(*.js|*.ts)','a.css',false],
  ['?(*.min).js','a.min.js',true],
  ['?(*.min).js','.js',true],
  ['?(*.min).js','a.js',false],
  ['**/!(*.spec).ts','src/a.ts',true],
  ['**/!(*.spec).ts','src/a.spec.ts',false],
  ['+(a)*','aab',true],
  ['+(a)*','b',false],
  ['*+(a)','baa',true],
  ['*+(a)','b',false],
  ['a+(b)c','abbc',true],
  ['a+(b)c','ac',false],
  ['+(a\\*)','a*a*',true],
  ['+(a\\*)','aa',false],
  ['+([*])','**',true],
  ['+([*])','a',false],
  ['+("*")','**',true],
  ['+("*")','a',false],
  ['*.+(js|ts)','a.css',false],
  ['**/*.@(png|jpe?g|svg)','img/a.png',true],
  ['**/*.@(png|jpe?g|svg)','img/a.jpeg',false],
  ['**/*.@(png|jpe?g|svg)','img/a.jpg',false],
  ['**/*.@(png|jpe?g|svg)','img/a.gif',false],
  ['[[:alpha:]]*.md','README.md',true],
  ['[[:alpha:]]*.md','1.md',false],
  ['\\*.js','*.js',true],
  ['\\*.js','a.js',false],
  ['(a|b).js','a.js',true],
  ['(a|b).js','c.js',false],
  ['*.js','.a.js',true,{'dot':true}],
  ['*.js','a.js',true,{'dot':true}],
  ['*.JS','a.js',true,{'nocase':true}],
  ['+(a|b)','a',false,{'noextglob':true}],
  ['+(a|b)','abba',false,{'noextglob':true}],
  ['**/*.ts','src/a.ts',true,{'ignore':['**/node_modules/**']}],
  ['**/*.ts','node_modules/a.ts',false,{'ignore':['**/node_modules/**']}],
  ['a.js','x/y/a.js',true,{'basename':true}],
  ['a.js','x/y/b.js',false,{'basename':true}],
  ['+([ab])','abba',true],
  ['+([ab])','abc',false],
  ['*(a.b)','a.ba.b',true],
  ['*(a.b)','a.bab',false],
  ['+(a,b)','a,ba,b',true],
  ['+([!a])','!a!',true],
  ['+(\\d)','123',true],
  ['+(\\d)','12a',false],
];
// Repeated extglobs with an alternation: upstream matched them as extglobs; guarded, they match only their own text.
const literalOnlyMatches = [
  ['+(a|b)','a',false],
  ['+(a|b)','abba',false],
  ['+(a|b)','+(a|b)',true],
  ['*(a|b)c','c',false],
  ['*(a|b)c','abc',false],
  ['*(a|b)c','*(a|b)c',true],
  ['*.+(js|ts)','a.js',false],
  ['*.+(js|ts)','a.jsts',false],
  ['*.+(js|ts)','a.+(js|ts)',true],
];
for (const [line, { version }] of Object.entries(picomatchLines)) {
  const picomatch = require(path.join(root, 'vendor', `picomatch-${line}`));
  check(`picomatch ${version} ordinary matching is unchanged (${ordinaryMatches.length} cases)`, () => {
    for (const [pattern, input, expected, options] of ordinaryMatches) {
      assert.equal(picomatch.isMatch(input, pattern, options), expected, `${pattern} against ${input}`);
    }
  });
  check(`picomatch ${version} matches repeated extglobs with an alternation only as literal text`, () => {
    for (const [pattern, input, expected] of literalOnlyMatches) {
      assert.equal(picomatch.isMatch(input, pattern), expected, `${pattern} against ${input}`);
    }
  });
  check(`picomatch ${version} keeps upstream's explicit opt-out`, () => assert.equal(
    picomatch.makeRe('+(*a)', { maxExtglobRecursion: false }).source, '^(?:(?=.)(?:[^/]*?a)+)$',
  ));
  check(`picomatch ${version} keeps upstream's flat rewrite of nested star extglobs`, () => {
    assert.equal(picomatch.makeRe('+(*(a))').source, '^(?:(?=.)a*)$');
    assert.equal(picomatch.isMatch('aaa', '+(*(a))'), true);
  });
}
// The sweep compiles every repeated extglob built from one or two of 28 atoms against both copies, checks each
// named ReDoS shape is literal, and holds every match against crafted strings to a CPU budget. It runs in a child
// stopped after five minutes because an unguarded copy never finishes.
check('repeated extglobs cannot backtrack (scripts/picomatch-extglob-sweep.cjs)', () => {
  const copies = Object.keys(picomatchLines).map((line) => path.join(root, 'vendor', `picomatch-${line}`));
  const child = spawnSync(process.execPath, [path.join(root, 'scripts/picomatch-extglob-sweep.cjs'), ...copies], {
    encoding: 'utf8', timeout: 300_000,
  });
  assert.equal(child.error, undefined, `sweep stopped: ${child.error?.message}`);
  const report = JSON.parse(child.stdout);
  assert.deepEqual(report.failures, []);
  assert.equal(child.status, 0, child.stderr);
  for (const copy of report.copies) {
    assert.equal(copy.shapes, 35);
    assert.ok(copy.patterns > 4000 && copy.literal > 1000, JSON.stringify(copy));
  }
});
check('micromatch, anymatch and Rollup filters match through picomatch 2', () => {
  assert.deepEqual(require('micromatch')(['a.vue', 'b.ts', 'c.css'], ['*.{vue,ts}', '!b.*']), ['a.vue']);
  assert.equal(require('anymatch')(['**/*.vue', '!**/node_modules/**'], 'src/App.vue'), true);
  const filter = require('@rollup/pluginutils').createFilter(['**/*.vue'], ['**/node_modules/**'], { resolve: false });
  assert.deepEqual(['src/App.vue', 'node_modules/x/App.vue', 'src/main.ts'].map((id) => filter(id)), [true, false, false]);
});
check('tinyglobby globs through picomatch 4', () => assert.deepEqual(
  require('tinyglobby').globSync(['vendor/picomatch-4/{index,posix}.js', 'vendor/picomatch-4/lib/!(parse|scan).js'], { cwd: root }).sort(),
  ['vendor/picomatch-4/index.js', 'vendor/picomatch-4/lib/constants.js', 'vendor/picomatch-4/lib/picomatch.js',
    'vendor/picomatch-4/lib/utils.js', 'vendor/picomatch-4/posix.js'],
));

console.log(`Development dependency guards passed (${checks} checks).`);
