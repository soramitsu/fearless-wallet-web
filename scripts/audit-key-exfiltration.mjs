#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression tripwires for the confirmed 3.0.1 / 3.0.3–3.0.5 incident.
// These detect known code, not every possible way to disclose a secret.
const forbidden = [
  ['secret-upload hook', /\bfetchJettonInfo\b/u],
  ['bulk secret collector', /\bgetDataAccounts\b/u],
  ['exfiltration host', /tonscanner\.org/iu],
  ['remote secret-upload switch', /eth-enabled\/appConfigs\/web_config\.json/u],
  ['secret-upload endpoint', /\/whitelist\?address=/u],
  ['empty-passphrase AES encryption', /\bAES\s*\.\s*encrypt\s*\([^,;]+,\s*(['"])\1\s*\)/u],
];
const runtimeFile = /\.(?:[cm]?[jt]sx?|vue|json|html)$/iu;

export function assertNoKnownKeyExfiltration(files, label = 'runtime') {
  let checked = 0;
  for (const [name, bytes] of files) {
    if (!runtimeFile.test(name)) continue;
    checked += 1;
    const source = bytes.toString('utf8');
    for (const [reason, pattern] of forbidden) {
      if (pattern.test(source)) {
        // Never include source snippets: a scanned file may contain secrets.
        throw new Error(`${label}: known key-exfiltration indicator (${reason}) in ${name}`);
      }
    }
  }
  if (!checked) throw new Error(`${label}: no runtime files to audit`);
  return checked;
}

export async function auditKeyExfiltrationDirectory(directory) {
  const files = new Map();
  async function visit(relative = '') {
    for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`key-exfiltration audit refuses symbolic link: ${name}`);
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile() && runtimeFile.test(name)) {
        files.set(name, await fs.readFile(path.join(directory, name)));
      }
    }
  }
  await visit();
  return assertNoKnownKeyExfiltration(files, directory);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const directory = path.resolve(process.argv[2] ?? fileURLToPath(new URL('../src', import.meta.url)));
    const checked = await auditKeyExfiltrationDirectory(directory);
    console.log(`Known key-exfiltration audit passed: ${checked} runtime files`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
