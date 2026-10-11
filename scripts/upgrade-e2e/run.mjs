#!/usr/bin/env node
// The real legacy-build upgrade E2E (web-keys.md §6, WK-5). For each scenario a released build, built from its own
// commit and lockfile (build-legacy.mjs), writes a profile in Chrome for Testing; this tree's production build replaces
// it in place under the same extension id; the assertions A0-A11 run on the result. Every host name except localhost is
// unresolvable; secrets are public test vectors (secrets.mjs).
//
// Usage: node scripts/upgrade-e2e/run.mjs [--snapshot] [--out <dir>] [scenario ...]
//   scenario ids: S1 S2 S3 S4 S5 S6 S7 S8 R1 ECDSA-2.6.3 ECDSA-3.0.6 (default: all)
//   --snapshot   also write tests/fixtures/upgrade/<version>/<state>.json from each released build's profile
//   UPGRADE_E2E_COLD_STARTS  cold starts per A9 check (default 20)
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CHROME } from './chrome.mjs';
import { cachedBuild } from './build-legacy.mjs';
import { headBuildDir } from './build-head.mjs';
import { root, testExtensionKey } from './config.mjs';
import { startDappServer } from './dapp/server.mjs';
import { startMockServices } from './mock-services.mjs';
import { cryptoReady, Report } from './head.mjs';
import { installKeyring305, loadKeyring305 } from './keyring-305.mjs';
import { SCENARIOS } from './scenarios.mjs';

// The 3.0.5 keyring (keyring-305.mjs) loads @polkadot 12.x next to this tree's 14.x on purpose.
process.env.POLKADOTJS_DISABLE_ESM_CJS_WARNING = '1';
const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const ids = args.filter((arg, index) => !arg.startsWith('--') && !(index > 0 && args[index - 1] === '--out'));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(option('--out') ?? path.join(root, 'output/upgrade-e2e', stamp));
const selected = ids.length
  ? ids.map((id) => {
      const scenario = SCENARIOS.find((candidate) => candidate.id === id);
      if (!scenario) throw new Error(`unknown scenario ${id}; known: ${SCENARIOS.map((candidate) => candidate.id).join(' ')}`);
      return scenario;
    })
  : SCENARIOS;
const chromeVersion = execFileSync(CHROME, ['--version'], { encoding: 'utf8' }).trim();

const builds = {};
for (const id of new Set(selected.flatMap(({ builds: needed }) => needed))) {
  const build = cachedBuild(id);
  if (!build) throw new Error(`legacy build ${id} is missing: run node scripts/upgrade-e2e/build-legacy.mjs ${id}`);
  builds[id] = build;
}

mkdirSync(outDir, { recursive: true });
await cryptoReady();
const legacy = await loadKeyring305(installKeyring305(path.join(outDir, 'keyring-3.0.5')));
const dapp = await startDappServer();
const mocks = await startMockServices({ dir: path.join(outDir, 'tls') });
const summary = {
  startedAt: new Date().toISOString(),
  chrome: chromeVersion,
  head: headBuildDir(),
  builds: Object.fromEntries(Object.entries(builds).map(([id, { provenance }]) => [id, { commit: provenance.commit, yarnLockSha256: provenance.yarnLockSha256, node: provenance.node }])),
  scenarios: [],
};
let port = Number(process.env.UPGRADE_E2E_PORT ?? 9611);
try {
  for (const scenario of selected) {
    const report = new Report(scenario.id, scenario.title);
    const ctx = {
      builds: Object.fromEntries(Object.entries(builds).map(([id, { dir }]) => [id, dir])),
      provenance: Object.fromEntries(Object.entries(builds).map(([id, { provenance }]) => [id, provenance])),
      head: headBuildDir(),
      workDir: path.join(outDir, scenario.id),
      port: port++,
      manifestKey: testExtensionKey(),
      dappUrl: dapp.url,
      mocks,
      hostRules: mocks.hostRules,
      args: mocks.args,
      legacy,
      chromeVersion,
      snapshot: args.includes('--snapshot'),
      coldStarts: Number(process.env.UPGRADE_E2E_COLD_STARTS ?? 20),
    };
    const started = Date.now();
    console.log(`\n=== ${scenario.id}: ${scenario.title}`);
    try {
      await scenario.run(ctx, report);
    } catch (error) {
      report.error = String(error?.stack ?? error);
      console.error(`[${scenario.id}] ERROR ${report.error}`);
    } finally {
      await ctx.session?.stop().catch(() => undefined);
    }
    report.seconds = Math.round((Date.now() - started) / 1000);
    writeFileSync(path.join(outDir, `${scenario.id}.json`), `${JSON.stringify({ ...report.toJSON(), seconds: report.seconds }, null, 2)}\n`);
    summary.scenarios.push({ id: scenario.id, title: scenario.title, ok: report.ok, ...report.toJSON(), checks: undefined, seconds: report.seconds });
    console.log(`=== ${scenario.id}: ${report.ok ? 'PASS' : 'FAIL'} (${report.checks.filter(({ ok }) => ok).length}/${report.checks.length} checks, ${report.seconds} s)`);
  }
} finally {
  await dapp.close();
  await mocks.close();
}
summary.mockRequests = [...new Set(mocks.requests.map(({ method, host, path: requestPath }) => `${method} ${host}${requestPath.replace(/accounts\/[^/]+/, 'accounts/<address>')}`))];
summary.ok = summary.scenarios.every(({ ok }) => ok);
summary.finishedAt = new Date().toISOString();
writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\n${summary.scenarios.map(({ id, ok, passed, failed }) => `${id} ${ok ? 'PASS' : 'FAIL'} ${passed}/${passed + failed}`).join('\n')}\nreport: ${path.join(outDir, 'report.json')}`);
if (!summary.ok) process.exitCode = 1;
