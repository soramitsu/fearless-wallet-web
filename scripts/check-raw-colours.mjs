import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const BASELINE_PATH = 'config/raw-colour-baseline.json';
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = ({ path, source }) => JSON.stringify([path, source]);
const sorted = (sites) => sites.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
const eligible = (path) => path.startsWith('src/') && !path.startsWith('src/styles/') && /\.vue$/i.test(path);

// Deliberately grep-like: scan template, script, style and comments. Match complete
// rgb()/rgba() expressions across lines so changing a later channel cannot reuse
// an exception for an unchanged opening line. Named colours/other CSS functions
// belong to a separate rule; this implements design-system 14.0's literal scope.
export function rawColourSites(path, source) {
  if (!eligible(path)) return [];
  const sites = new Map();
  const expression = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\w-])|\brgba?\s*\([^)]*\)/gi;
  for (const match of source.matchAll(expression)) {
    const start = source.lastIndexOf('\n', match.index - 1) + 1;
    const newline = source.indexOf('\n', match.index + match[0].length);
    const text = source.slice(start, newline < 0 ? source.length : newline).trim();
    const site = { path, source: text, count: 1 };
    const prior = sites.get(key(site));
    if (prior) prior.count += 1;
    else sites.set(key(site), site);
  }
  return sorted([...sites.values()]);
}

export function scanRawColours(root) {
  const result = [];
  const walk = (directory) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (path === 'src/styles') continue;
      if (entry.isSymbolicLink()) throw new Error(`Source symlink cannot bypass colour audit: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && eligible(path))
        result.push(...rawColourSites(path, readFileSync(join(root, path), 'utf8')));
    }
  };
  walk('src');
  return sorted(result);
}

export function parseBaseline(value) {
  if (value?.schemaVersion !== 1 || !/^[\da-f]{40}$/.test(value?.sourceCommit) || !Array.isArray(value?.sites)) {
    throw new Error('Malformed raw-colour baseline');
  }
  const seen = new Set();
  for (const site of value.sites) {
    if (
      typeof site?.path !== 'string' ||
      !eligible(site.path) ||
      site.path.split('/').some((part) => part === '..' || part === '.') ||
      typeof site.source !== 'string' ||
      !site.source ||
      site.source.trim() !== site.source ||
      !Number.isSafeInteger(site.count) ||
      site.count < 1 ||
      seen.has(key(site))
    ) {
      throw new Error('Malformed or duplicate raw-colour baseline site');
    }
    const detected = rawColourSites(site.path, site.source);
    if (!detected.length) throw new Error(`Baseline site has no raw colour: ${site.path}`);
    seen.add(key(site));
  }
  return value;
}

export function compareSites(current, allowed) {
  const actual = new Map(current.map((site) => [key(site), site.count]));
  const baseline = new Map(allowed.map((site) => [key(site), site.count]));
  return {
    added: current.filter((site) => site.count > (baseline.get(key(site)) ?? 0)),
    stale: allowed.filter((site) => site.count > (actual.get(key(site)) ?? 0)),
  };
}

export function assertBaselineShrinks(current, previous) {
  parseBaseline(current);
  parseBaseline(previous);
  if (current.sourceCommit !== previous.sourceCommit || compareSites(current.sites, previous.sites).added.length) {
    throw new Error('Raw-colour baseline may only shrink; move new colours into semantic theme roles');
  }
}

export function auditRawColours(root, baseRef) {
  const baseline = parseBaseline(JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')));
  const current = scanRawColours(root);
  const differences = compareSites(current, baseline.sites);
  if (differences.added.length || differences.stale.length) {
    throw new Error(
      `Raw-colour drift: use theme roles for additions and remove obsolete exceptions.\n${JSON.stringify(differences, null, 2)}`
    );
  }
  let baselineComparison = 'not requested (source drift only)';
  if (baseRef) {
    // No shell interpolation and no network access: CI supplies an already fetched SHA.
    const commit = execFileSync('git', ['rev-parse', '--verify', `${baseRef}^{commit}`], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    const files = execFileSync('git', ['ls-tree', '--name-only', commit, '--', BASELINE_PATH], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
    if (files) {
      const previous = JSON.parse(
        execFileSync('git', ['show', `${commit}:${BASELINE_PATH}`], { cwd: root, encoding: 'utf8' })
      );
      assertBaselineShrinks(baseline, previous);
      baselineComparison = `only shrinks from ${commit}`;
    } else {
      baselineComparison = `initial adoption; no baseline in ${commit}`;
    }
  }
  return {
    files: new Set(current.map((site) => site.path)).size,
    sites: current.length,
    occurrences: current.reduce((total, site) => total + site.count, 0),
    baselineComparison,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--base-ref' || !args[1]))
      throw new Error('Usage: check-raw-colours.mjs [--base-ref COMMIT]');
    console.log(JSON.stringify(auditRawColours(repository, args[1]), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
