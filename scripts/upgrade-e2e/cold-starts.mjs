#!/usr/bin/env node
// A9 on its own: cold starts of the build installed in a scenario's work directory (output/upgrade-e2e/<run>/<scenario>),
// each answering the first messages after the worker starts. Prints one JSON line per start and a summary.
// Usage: node scripts/upgrade-e2e/cold-starts.mjs <scenario work dir> [count]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coldStartProbe, freePort } from './chrome.mjs';
import { startMockServices } from './mock-services.mjs';

const [, , workDir, count = '30'] = process.argv;
const manifest = JSON.parse(readFileSync(join(workDir, 'extension', 'manifest.json'), 'utf8'));
const extId = process.env.UPGRADE_E2E_EXTENSION_ID ?? 'plnlnnlkcnkiokjgpefakfhgngpbnaec';
const mocks = await startMockServices({ dir: join(workDir, '..', 'tls-cold-starts') });
const runs = [];
try {
  for (let i = 0; i < Number(count); i++) {
    const started = Date.now();
    const run = await coldStartProbe({
      profileDir: join(workDir, 'profile'),
      extDir: join(workDir, 'extension'),
      port: await freePort(),
      extId,
      hostRules: mocks.hostRules,
      args: mocks.args,
    }).catch((error) => ({ error: String(error?.message ?? error) }));
    runs.push({ ...run, ms: Date.now() - started });
    console.log(JSON.stringify(runs.at(-1)));
  }
} finally {
  await mocks.close();
}
const right = runs.filter((run) => run.hasMasterPassword === true && run.keyringIsLocked === true && run.hasAccounts === true);
console.log(JSON.stringify({ version: manifest.version, starts: runs.length, right: right.length }));
