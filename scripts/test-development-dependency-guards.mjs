import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
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
for (const name of ['braces', 'node-forge']) {
  const installed = path.dirname(require.resolve(`${name}/package.json`));
  const vendored = path.join(root, 'vendor', name);
  function compare(directory = '') {
    for (const entry of readdirSync(path.join(vendored, directory), { withFileTypes: true })) {
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) compare(relative);
      else if (/\.(?:c?js|json)$/.test(entry.name)) {
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

console.log(`Development dependency guards passed (${checks} checks).`);
