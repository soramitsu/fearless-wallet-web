#!/usr/bin/env node
/* eslint-disable no-console */
// Release gate for 3.0.6: fails when a built package still contains anything of the code this hotfix removes.
//
//   node scripts/hotfix-3.0.6/check-package.js <unpacked package dir> [<unpacked package dir> ...]
//
// Files are read as text and never executed. Exit code 0: clean. 1: at least one finding. 2: usage error.

const fs = require('fs');
const path = require('path');

// Every entry is text the removed code put into the 3.0.5 bundle; minification keeps all of them
// (property names, object keys and string or template literals are not renamed).
const REMOVED = [
  { label: 'unlock-time call and its implementation', text: 'fetchJettonInfo' },
  { label: 'secret-returning keyring accessor', text: 'getDataAccounts' },
  { label: 'upload request', text: 'whitelist?address' },
  { label: 'remote switch', text: 'eth-enabled' },
  { label: 'storage marker of the upload', text: 'myAddresses' },
  { label: 'host of the unused baseUrl field', text: 'tonscanner' },
  { label: 'encryption with an empty passphrase', pattern: /\.AES\.encrypt\([^,()]+,\s*(""|''|``)\)/ },
];

const TEXT_FILE = /\.(js|mjs|cjs|json|html|css|map|txt)$/;

function listFiles(root, dir = '') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);

    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  });
}

// Labels of the removed pieces that appear in a text.
function findRemovedText(content) {
  return REMOVED.filter(({ text, pattern }) => (pattern ? pattern.test(content) : content.includes(text))).map(
    ({ label }) => label
  );
}

function findRemovedCode(packageDir) {
  return listFiles(packageDir)
    .filter((file) => TEXT_FILE.test(file))
    .flatMap((file) =>
      findRemovedText(fs.readFileSync(path.join(packageDir, file), 'utf8')).map((label) => ({ file, label }))
    );
}

function main(packageDirs) {
  if (!packageDirs.length) {
    console.error('usage: check-package.js <unpacked package dir> [<unpacked package dir> ...]');

    return 2;
  }

  const findings = packageDirs.flatMap((packageDir) =>
    findRemovedCode(packageDir).map((finding) => ({ packageDir, ...finding }))
  );

  findings.forEach(({ packageDir, file, label }) => console.error(`FOUND ${path.join(packageDir, file)}: ${label}`));
  console.log(findings.length ? `${findings.length} finding(s)` : `clean: ${packageDirs.join(', ')}`);

  return findings.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { findRemovedCode, findRemovedText };
