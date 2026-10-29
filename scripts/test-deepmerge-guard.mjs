/* global console, process, URL */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let checks = 0;
function check(name, action) {
  action();
  checks++;
  console.log(`PASS ${name}`);
}

export function checkDeepmergeBehavior(merge, label, plainPrototype = Object.prototype) {
  const payload = () => JSON.parse('{"__proto__":{"syntheticInheritedFlag":true},"safe":"retained"}');
  const unpoisoned = (object) => {
    assert.equal(Object.getPrototypeOf(object), plainPrototype, 'Returned object must retain its plain prototype');
    assert.equal(object.syntheticInheritedFlag, undefined, 'Returned object must not inherit attacker data');
    assert.equal(Object.hasOwn(object, '__proto__'), false, 'Forbidden key must not be copied');
    assert.equal(({}).syntheticInheritedFlag, undefined, 'Global prototype must remain unchanged too');
  };
  check(`${label}: null-prototype target`, () => {
    const target = Object.create(null);
    target.existing = 1;
    const result = merge(target, payload());
    unpoisoned(result);
    assert.equal(result.safe, 'retained');
    assert.equal(result.existing, 1);
  });
  for (const placeholder of [null, undefined, 0, false, 'placeholder']) {
    check(`${label}: nested ${String(placeholder)} placeholder`, () => {
      const result = merge({ session: placeholder }, { session: payload() });
      unpoisoned(result.session);
      assert.equal(result.session.safe, 'retained');
    });
  }
  check(`${label}: target owns __proto__`, () => {
    const result = merge(payload(), { added: 2 });
    unpoisoned(result);
    assert.equal(result.safe, 'retained');
    assert.equal(result.added, 2);
  });
  check(`${label}: both inputs own __proto__`, () => unpoisoned(merge(payload(), payload())));
  check(`${label}: array elements are cloned safely`, () => {
    const result = merge({ items: [] }, { items: [payload()] });
    unpoisoned(result.items[0]);
    assert.equal(result.items[0].safe, 'retained');
  });
  check(`${label}: all() retains the same guard`, () => {
    const result = merge.all([{ session: null }, { session: payload() }, { ordinary: true }]);
    unpoisoned(result.session);
    assert.equal(result.ordinary, true);
  });
  check(`${label}: forbidden getters are never invoked in either loop`, () => {
    const dangerous = {};
    Object.defineProperty(dangerous, '__proto__', { enumerable: true, get() { throw new Error('Forbidden getter evaluated'); } });
    unpoisoned(merge(dangerous, {}));
    unpoisoned(merge(Object.create(null), dangerous));
  });
  check(`${label}: ordinary nested merges and array concatenation preserve inputs`, () => {
    const target = { nested: { left: 1 }, list: [{ left: true }] };
    const source = { nested: { right: 2 }, list: [{ right: true }] };
    const result = merge(target, source);
    assert.equal(JSON.stringify(result), JSON.stringify({ nested: { left: 1, right: 2 }, list: [{ left: true }, { right: true }] }));
    assert.notEqual(result.nested, target.nested);
    assert.notEqual(result.list[0], target.list[0]);
    result.list[0].left = false;
    assert.equal(target.list[0].left, true);
    assert.deepEqual(source, { nested: { right: 2 }, list: [{ right: true }] });
  });
  check(`${label}: legitimate null placeholders retain source fields`, () => {
    const result = merge({ session: null }, { session: { name: 'ordinary' } });
    assert.equal(result.session.name, 'ordinary');
  });
  check(`${label}: enumerable symbols remain supported`, () => {
    const symbol = Symbol('ordinary');
    const result = merge({ [symbol]: { left: 1 } }, { [symbol]: { right: 2 } });
    assert.equal(result[symbol].left, 1);
    assert.equal(result[symbol].right, 2);
  });
  check(`${label}: customMerge remains supported`, () => {
    const result = merge({ label: { first: 'a' } }, { label: { second: 'b' } }, {
      customMerge: key => key === 'label' ? (left, right) => `${left.first}:${right.second}` : undefined,
    });
    assert.equal(result.label, 'a:b');
  });
  check(`${label}: clone=false retains documented reference semantics`, () => {
    const child = { ordinary: true };
    assert.equal(merge({}, { child }, { clone: false }).child, child);
  });
  check(`${label}: dates and regular expressions are not object-merged`, () => {
    const date = new Date(0);
    const regex = /ordinary/;
    const result = merge({}, { date, regex });
    assert.equal(result.date, date);
    assert.equal(result.regex, regex);
  });
  check(`${label}: TonConnect plain-object and array-overwrite options remain compatible`, () => {
    const defaults = { ui: { theme: 'light', colors: { text: '#111' } }, wallets: ['old'] };
    const options = { ui: { colors: { background: '#fff' } }, wallets: ['replacement'] };
    const plain = value => value !== null && typeof value === 'object' &&
      (Object.getPrototypeOf(value) === null || Object.getPrototypeOf(value) === Object.prototype);
    const result = merge(defaults, options, { arrayMerge: (_target, source) => source, isMergeableObject: plain });
    assert.equal(result.ui.theme, 'light');
    assert.equal(result.ui.colors.text, '#111');
    assert.equal(result.ui.colors.background, '#fff');
    assert.deepEqual(result.wallets, ['replacement']);
    assert.deepEqual(defaults.wallets, ['old']);
  });
  check(`${label}: ordinary constructor and prototype data are not silently discarded`, () => {
    const result = merge(Object.create(null), { constructor: 'ordinary', prototype: 'data' });
    assert.equal(Object.getPrototypeOf(result), plainPrototype);
    assert.equal(Object.hasOwn(result, 'constructor'), true);
    assert.equal(result.constructor, 'ordinary');
    assert.equal(result.prototype, 'data');
  });
}

function main() {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = readFileSync(path.join(root, 'yarn.lock'), 'utf8');
  check('all deepmerge selectors resolve to the reviewed local package', () => {
    assert.equal(packageJson.resolutions?.deepmerge, 'file:./vendor/deepmerge');
    assert.equal(/resolution:\s*["']deepmerge@npm:/.test(lock), false, 'No vulnerable npm deepmerge resolution may remain');
  });
  const installed = path.dirname(require.resolve('deepmerge/package.json'));
  const vendored = path.join(root, 'vendor/deepmerge');
  const manifest = require('deepmerge/package.json');
  check('local package retains honest upstream version and private status', () => {
    assert.equal(manifest.name, 'deepmerge');
    assert.equal(manifest.version, '4.3.1');
    assert.equal(manifest.private, true);
    assert.equal(manifest.main, 'dist/cjs.js');
    assert.equal(manifest.license, 'MIT');
    assert.deepEqual(manifest.dependencies ?? {}, {});
  });
  for (const file of ['package.json', 'index.js', 'index.d.ts', 'dist/cjs.js', 'dist/umd.js', 'license.txt', 'upstream-provenance.json']) {
    check(`installed deepmerge bytes match vendor: ${file}`, () => {
      assert.deepEqual(readFileSync(path.join(installed, file)), readFileSync(path.join(vendored, file)));
    });
  }
  for (const consumer of ['@tonconnect/ui', 'addons-linter']) {
    const consumerRequire = createRequire(require.resolve(consumer));
    check(`${consumer} resolves the guarded installed entrypoint`, () => {
      assert.equal(realpathSync(consumerRequire.resolve('deepmerge')), realpathSync(require.resolve('deepmerge')));
      assert.equal(consumerRequire('deepmerge'), require('deepmerge'));
    });
  }
  const cjs = require('deepmerge/dist/cjs.js');
  checkDeepmergeBehavior(require('deepmerge'), 'package main');
  checkDeepmergeBehavior(cjs, 'dist/cjs.js');
  checkDeepmergeBehavior(require('deepmerge/dist/umd.js'), 'dist/umd.js');
  // The source's only require is an upstream build-only dependency. Use the exact
  // unchanged predicate exposed by the actual distributed build, without adding a runtime dependency.
  const options = {};
  cjs({}, {}, options);
  const context = vm.createContext({ module: { exports: {} }, require(name) {
    assert.equal(name, 'is-mergeable-object');
    return options.isMergeableObject;
  } });
  new vm.Script(readFileSync(path.join(installed, 'index.js'), 'utf8'), { filename: 'installed-deepmerge/index.js' })
    .runInContext(context, { timeout: 1000 });
  checkDeepmergeBehavior(context.module.exports, 'index.js source', vm.runInContext('Object.prototype', context));
  console.log(`[deepmerge-security-test] ${checks} checks passed; all installed entrypoints guarded`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
