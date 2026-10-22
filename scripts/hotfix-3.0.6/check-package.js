#!/usr/bin/env node
/* eslint-disable no-console */
// Release gate for 3.0.6: fails when a built package still contains anything of the code this hotfix removes.
//
//   node scripts/hotfix-3.0.6/check-package.js <unpacked package dir> [<unpacked package dir> ...]
//
// Files are read as text and never executed. Exit code 0: clean. 1: at least one finding. 2: usage error.

const fs = require('fs');
const os = require('os');
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

// Webpack inlines import.meta.url, so the package carries absolute build paths (3.0.5 has
// /var/jenkins/workspace/fearless_wallet-web_master/...). The package is public: a build path must not point into a
// personal or temporary folder, name the build machine's user, or say what the release or its tooling is.
const PERSONAL_LOCATION = /^file:\/\/\/(Users\/(?!Shared\/)|home\/|root\/|(private\/)?var\/folders\/)/;
const REVEALING_WORD = /hotfix|incident|security|audit|exfil|release-3\.0\.6|scratchpad|claude|codex/i;

function findRevealingPaths(content, username = os.userInfo().username) {
  const user = username && username.length >= 3 ? username.toLowerCase() : null;
  const buildPaths = new Set(content.match(/file:\/\/\/[^"'`\s)]+/g) ?? []);

  return [...buildPaths].filter(
    (buildPath) =>
      PERSONAL_LOCATION.test(buildPath) ||
      REVEALING_WORD.test(buildPath) ||
      (user !== null && buildPath.toLowerCase().includes(user))
  );
}

function findRemovedCode(packageDir, username = os.userInfo().username) {
  return listFiles(packageDir)
    .filter((file) => TEXT_FILE.test(file))
    .flatMap((file) => {
      const content = fs.readFileSync(path.join(packageDir, file), 'utf8');

      return [
        ...findRemovedText(content).map((label) => ({ file, label })),
        ...findRevealingPaths(content, username).map((buildPath) => ({ file, label: `build path ${buildPath}` })),
      ];
    });
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

module.exports = { findRemovedCode, findRemovedText, findRevealingPaths };
