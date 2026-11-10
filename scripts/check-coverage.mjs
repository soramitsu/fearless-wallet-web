import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function productionSources(root, directory = path.join(root, 'src')) {
  const entries = await readdir(directory, { withFileTypes: true });
  const lists = await Promise.all(entries.map(async entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return productionSources(root, file);
    return /\.(?:js|jsx|ts|tsx|vue)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path.relative(root, file).split(path.sep).join('/')] : [];
  }));
  return lists.flat();
}

export function summarizeCoverage(report, expected, root = process.cwd()) {
  const wanted = new Set(expected);
  const represented = new Set();
  let total = 0, covered = 0;
  for (const record of report.split('end_of_record')) {
    if (!record.trim()) continue;
    const headers = [...record.matchAll(/^SF:(.*)$/gm)];
    if (headers.length !== 1 || !headers[0][1]) throw new Error('Each coverage record requires exactly one source header');
    const source = headers[0][1];
    const name = path.relative(root, path.resolve(root, source)).split(path.sep).join('/');
    // V8 can attribute generated JSON-module code to data files. Only the
    // authored JS/TS/Vue inventory contributes executable lines to this gate.
    if (!wanted.has(name)) continue;
    if (represented.has(name)) throw new Error(`Duplicate coverage record: ${name}`);
    represented.add(name);
    const counter = key => {
      const values = [...record.matchAll(new RegExp(`^${key}:(.*)$`, 'gm'))];
      if (values.length !== 1 || !/^\d+$/.test(values[0][1])) throw new Error(`Invalid ${key} counter: ${name}`);
      const value = Number(values[0][1]);
      if (!Number.isSafeInteger(value)) throw new Error(`Unsafe ${key} counter: ${name}`);
      return value;
    };
    const fileTotal = counter('LF'), fileCovered = counter('LH');
    const lines = record.split(/\r?\n/).filter(line => line.startsWith('DA:')).map(line => {
      const match = line.match(/^DA:([1-9]\d*),(\d+)(?:,[^,\r\n]+)?$/);
      if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))) {
        throw new Error(`Invalid executable-line record: ${name}`);
      }
      return { number: Number(match[1]), hits: Number(match[2]) };
    });
    if (new Set(lines.map(line => line.number)).size !== lines.length || lines.length !== fileTotal ||
        lines.filter(line => line.hits > 0).length !== fileCovered) {
      throw new Error(`Line counters disagree with executable-line records: ${name}`);
    }
    total += fileTotal;
    covered += fileCovered;
  }
  const missing = expected.filter(file => !represented.has(file));
  if (missing.length) throw new Error(`Coverage omitted ${missing.length} production source files:\n${missing.join('\n')}`);
  return { total, covered, sourceFiles: wanted.size };
}

export function requireCoverage(summary) {
  const { total, covered } = summary;
  if (!total || covered / total < 0.8) {
    throw new Error(`Whole-app authored line coverage is ${total ? (covered / total * 100).toFixed(2) : '0'}%; at least 80% is required.`);
  }
}

export async function checkCoverage(root = process.cwd()) {
  const expected = await productionSources(root);
  const report = await readFile(path.join(root, 'coverage/lcov.info'), 'utf8');
  const summary = summarizeCoverage(report, expected, root);
  requireCoverage(summary);
  console.info(`All ${summary.sourceFiles} production source files represented; ${summary.covered}/${summary.total} authored executable lines covered (${(summary.covered / summary.total * 100).toFixed(2)}%).`);
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await checkCoverage();
}
