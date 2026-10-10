#!/usr/bin/env node
/* eslint-disable no-console */
// Compares two unpacked extension packages file by file, without executing either of them.
//
//   node scripts/hotfix-3.0.6/compare-packages.js <reference dir> <candidate dir> [--out <dir>] [--names]
//
// - JavaScript files are parsed (never run) and compared token by token, so formatting does not matter.
// - With --names, the comparison is up to a consistent renaming of local names. The minifier picks the names
//   of local variables and #private members from how often every character occurs in the whole bundle, so
//   one changed string can rename thousands of unrelated variables. --names writes each such name as
//   "$<scopes up to its declaration>.<position among the declarations of that scope>" instead. Two files
//   that give the same tokens this way have the same code with the same bindings. Property names, strings,
//   numbers and globals are always compared as written.
// - manifest.json is compared key by key; every other file is compared by SHA-256.
// - _metadata/ is added by the store and is reported, not compared.
//
// The token lists and the unified diffs are written to --out (default: a new directory in the OS temp dir).
// Exit code: 0 when the comparison ran, whatever it found; 2 on a usage or parse error.

const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const acorn = require('acorn');

const STORE_ADDED = new Set(['_metadata/verified_contents.json', '_metadata/computed_hashes.json']);

function listFiles(root, dir = '') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);

    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parse(code) {
  const attempt = (sourceType) => {
    const tokens = [];
    const ast = acorn.parse(code, {
      ecmaVersion: 'latest',
      allowHashBang: true,
      ranges: true,
      sourceType,
      onToken: tokens,
    });

    return { ast, tokens };
  };

  try {
    return attempt('module');
  } catch {
    return attempt('script');
  }
}

// Identifier offset -> a name that depends only on where the variable is declared, not on what it is called.
function localNames(ast) {
  const { analyze } = require('eslint-scope');
  const manager = analyze(ast, { ecmaVersion: 2022, sourceType: ast.sourceType });
  const names = new Map();

  const scopesUp = (from, to) => {
    let count = 0;

    for (let scope = from; scope !== to; scope = scope.upper) count += 1;

    return count;
  };

  manager.scopes.forEach((scope) => {
    scope.variables
      .filter(({ identifiers }) => identifiers.length) // the implicit `arguments` is never renamed
      .sort((a, b) => a.identifiers[0].range[0] - b.identifiers[0].range[0])
      .forEach((variable, position) => {
        variable.identifiers.forEach(({ range }) => names.set(range[0], `$0.${position}`));
        variable.references.forEach(({ identifier, from }) =>
          names.set(identifier.range[0], `$${scopesUp(from, scope)}.${position}`)
        );
      });
  });

  return names;
}

// (#name, offset) -> "#<classes up to the declaring class>.<position among its #private members>".
function privateNames(ast) {
  const classes = [];
  const pending = [ast];

  while (pending.length) {
    const node = pending.pop();

    if (node.type === 'ClassBody') {
      const declared = node.body
        .filter(({ key }) => key && key.type === 'PrivateIdentifier')
        .sort((a, b) => a.key.start - b.key.start)
        .map(({ key }) => key.name);

      classes.push({ start: node.start, end: node.end, declared: [...new Set(declared)] });
    }

    Object.values(node).forEach((child) => {
      if (Array.isArray(child)) pending.push(...child.filter((item) => item && typeof item.type === 'string'));
      else if (child && typeof child.type === 'string') pending.push(child);
    });
  }

  return (name, offset) => {
    const enclosing = classes
      .filter(({ start, end }) => start <= offset && offset < end)
      .sort((a, b) => b.start - a.start);
    const up = enclosing.findIndex(({ declared }) => declared.includes(name));

    return up === -1 ? `#${name}` : `#${up}.${enclosing[up].declared.indexOf(name)}`;
  };
}

function tokenLines(file, ignoreLocalNames) {
  const code = fs.readFileSync(file, 'utf8');
  const { ast, tokens } = parse(code);
  const locals = ignoreLocalNames ? localNames(ast) : new Map();
  const privateName = ignoreLocalNames ? privateNames(ast) : (name) => `#${name}`;

  return tokens.map(({ type, value, start, end }) => {
    if (type.label === 'name') return locals.get(start) ?? value;
    if (type.label === 'privateId') return privateName(value, start);
    if (type.label === 'string') return JSON.stringify(value);
    if (type.label === 'regexp' || type.label === 'template' || type.label === 'num') return code.slice(start, end);

    return value === undefined ? type.label : String(value);
  });
}

function unifiedDiff(fileA, fileB) {
  try {
    execFileSync('diff', ['-U4', fileA, fileB], { maxBuffer: 1 << 30 });

    return '';
  } catch (error) {
    if (error.status === 1) return error.stdout.toString();

    throw error;
  }
}

function summarise(diff) {
  const lines = diff.split('\n');

  return {
    hunks: lines.filter((line) => line.startsWith('@@')).length,
    removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
    added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
  };
}

function diffJson(reference, candidate, prefix = '') {
  const keys = new Set([...Object.keys(reference ?? {}), ...Object.keys(candidate ?? {})]);

  return [...keys].flatMap((key) => {
    const [a, b] = [reference?.[key], candidate?.[key]];
    const name = prefix ? `${prefix}.${key}` : key;

    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    if (a && b && typeof a === 'object' && typeof b === 'object') return diffJson(a, b, name);

    return [`${name}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`];
  });
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name) && args.splice(args.indexOf(name), 1).length === 1;
  const ignoreLocalNames = flag('--names');
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? fs.mkdtempSync(path.join(os.tmpdir(), 'compare-packages-')) : args[outIndex + 1];

  if (outIndex !== -1) args.splice(outIndex, 2);

  const [reference, candidate] = args;

  if (!reference || !candidate || args.length !== 2) {
    console.error('usage: compare-packages.js <reference dir> <candidate dir> [--out <dir>] [--names]');
    process.exit(2);
  }

  fs.mkdirSync(out, { recursive: true });

  const referenceFiles = new Set(listFiles(reference));
  const candidateFiles = new Set(listFiles(candidate));
  const report = { identical: [], different: [], onlyInReference: [], onlyInCandidate: [], storeAdded: [] };

  [...new Set([...referenceFiles, ...candidateFiles])].sort().forEach((file) => {
    if (STORE_ADDED.has(file)) return report.storeAdded.push(file);
    if (!candidateFiles.has(file)) return report.onlyInReference.push(file);
    if (!referenceFiles.has(file)) return report.onlyInCandidate.push(file);

    const [a, b] = [path.join(reference, file), path.join(candidate, file)];

    if (sha256(a) === sha256(b)) return report.identical.push(file);

    if (file === 'manifest.json') {
      const changes = diffJson(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8')));

      return report.different.push({ file, changes });
    }

    if (!file.endsWith('.js')) return report.different.push({ file, changes: ['bytes differ'] });

    const base = path.join(out, file.replace(/[\\/]/g, '__'));

    fs.writeFileSync(`${base}.reference.tokens`, tokenLines(a, ignoreLocalNames).join('\n') + '\n');
    fs.writeFileSync(`${base}.candidate.tokens`, tokenLines(b, ignoreLocalNames).join('\n') + '\n');

    const diff = unifiedDiff(`${base}.reference.tokens`, `${base}.candidate.tokens`);

    if (!diff) return report.identical.push(`${file} (same tokens, bytes differ)`);

    fs.writeFileSync(`${base}.diff`, diff);
    report.different.push({ file, ...summarise(diff), diff: `${base}.diff` });
  });

  console.log(`reference: ${reference}`);
  console.log(`candidate: ${candidate}`);
  console.log(`local names: ${ignoreLocalNames ? 'compared up to consistent renaming' : 'compared as written'}`);
  console.log(`identical: ${report.identical.length} files`);
  report.identical.filter((file) => file.includes('(')).forEach((file) => console.log(`  ${file}`));
  console.log(`store-added (not compared): ${report.storeAdded.join(', ') || 'none'}`);
  console.log(`only in reference: ${report.onlyInReference.join(', ') || 'none'}`);
  console.log(`only in candidate: ${report.onlyInCandidate.join(', ') || 'none'}`);
  console.log(`different: ${report.different.length} files`);
  report.different.forEach(({ file, changes, hunks, removed, added, diff }) => {
    if (changes) return console.log(`  ${file}\n${changes.map((change) => `    ${change}`).join('\n')}`);

    console.log(`  ${file}: ${hunks} hunks, ${removed} tokens removed, ${added} tokens added -> ${diff}`);
  });
}

if (require.main === module) main();

module.exports = { tokenLines };
