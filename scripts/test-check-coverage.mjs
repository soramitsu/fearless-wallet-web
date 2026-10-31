import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checkCoverage, productionSources, requireCoverage, summarizeCoverage } from './check-coverage.mjs';

const record = (name, total, covered) => `SF:${name}\n${Array.from({ length: total }, (_, index) => `DA:${index + 1},${index < covered ? 1 : 0}`).join('\n')}\nLF:${total}\nLH:${covered}\nend_of_record\n`;
const source = 'src/app.ts';

test('passes exactly eighty percent authored executable coverage', () => {
  const summary = summarizeCoverage(record(source, 10, 8), [source]);
  assert.deepEqual(summary, { total: 10, covered: 8, sourceFiles: 1 });
  assert.doesNotThrow(() => requireCoverage(summary));
});

test('fully covered generated JSON cannot lift failing authored code over the floor', () => {
  const report = record(source, 10, 7) + record('src/data.json', 100, 100);
  const summary = summarizeCoverage(report, [source]);
  assert.deepEqual(summary, { total: 10, covered: 7, sourceFiles: 1 });
  assert.throws(() => requireCoverage(summary), /70.00%/);
});

test('missing production source fails even when represented files pass', () => {
  assert.throws(() => summarizeCoverage(record(source, 10, 10), [source, 'src/omitted.vue']), /omitted.vue/);
});

test('duplicate source records cannot double credit covered lines', () => {
  assert.throws(() => summarizeCoverage(record(source, 10, 10).repeat(2), [source]), /Duplicate/);
});

test('line totals must match actual executable-line entries', () => {
  assert.throws(() => summarizeCoverage(record(source, 10, 8).replace('LF:10', 'LF:9'), [source]), /disagree/);
});

test('covered totals must match lines with hits', () => {
  assert.throws(() => summarizeCoverage(record(source, 10, 7).replace('LH:7', 'LH:8'), [source]), /disagree/);
});

test('duplicate executable-line entries are rejected', () => {
  assert.throws(() => summarizeCoverage(record(source, 10, 8).replace('DA:2,1', 'DA:1,1'), [source]), /disagree/);
});

test('malformed additional line records cannot be silently ignored', () => {
  for (const entry of ['DA:2,-1', 'DA:2,NaN', 'DA:0,1', 'DA:9007199254740992,1', 'DA:2,9007199254740992']) {
    assert.throws(() => summarizeCoverage(record(source, 1, 1).replace('LF:', `${entry}\nLF:`), [source]), /Invalid executable-line/);
  }
});

test('alternate numeric spelling cannot duplicate an executable line', () => {
  assert.throws(() => summarizeCoverage(record(source, 2, 2).replace('DA:2,1', 'DA:01,1'), [source]), /Invalid executable-line/);
});

test('multiple source headers in one record are rejected', () => {
  assert.throws(() => summarizeCoverage(record(source, 1, 1).replace('DA:1,1', 'SF:src/other.ts\nDA:1,1'), [source]), /exactly one source/);
});

test('records without a source header are rejected', () => {
  assert.throws(() => summarizeCoverage(record(source, 1, 1) + 'DA:1,1\nLF:1\nLH:1\nend_of_record', [source]), /exactly one source/);
});

test('malformed or repeated totals are rejected', () => {
  for (const value of ['-1', 'NaN', '9007199254740992', '10\nLF:10']) {
    assert.throws(() => summarizeCoverage(record(source, 10, 8).replace('LF:10', `LF:${value}`), [source]), /counter/);
  }
});

test('zero executable lines cannot pass the target', () => {
  assert.throws(() => requireCoverage(summarizeCoverage(record(source, 0, 0), [source])), /0%/);
});

test('absolute LCOV paths normalize against the repository', () => {
  const root = path.resolve('/fixture');
  assert.equal(summarizeCoverage(record(path.join(root, source), 10, 8), [source], root).covered, 8);
});

test('source inventory and command gate cover nested code but exclude declarations and data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fearless-coverage-gate-'));
  try {
    await mkdir(path.join(root, 'src/nested'), { recursive: true });
    await mkdir(path.join(root, 'coverage'));
    for (const file of ['src/app.ts', 'src/nested/Panel.vue', 'src/types.d.ts', 'src/data.json']) {
      await writeFile(path.join(root, file), 'fixture');
    }
    const expected = await productionSources(root);
    assert.deepEqual(expected.sort(), ['src/app.ts', 'src/nested/Panel.vue']);
    await writeFile(path.join(root, 'coverage/lcov.info'), record('src/app.ts', 10, 8) + record('src/nested/Panel.vue', 10, 9) + record('src/data.json', 100, 100));
    assert.deepEqual(await checkCoverage(root), { total: 20, covered: 17, sourceFiles: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
