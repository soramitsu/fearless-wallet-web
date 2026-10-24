/* global console, process */
// Fails when a build carries any part of the portfolio dashboard. The dashboard ships by default; a build made without it
// (VUE_APP_PORTFOLIO_DASHBOARD=false, or a release whose flag is turned off in PRODUCTION_RELEASE_FLAGS) must really have
// none of it, so a stray static import cannot leave part of it behind (src/portfolio/dashboard/dashboardFlag.ts).
// Usage: node scripts/check-portfolio-dashboard-absent.mjs <dir>
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Text that exists only in the dashboard's screens, styles and storage. */
export const DASHBOARD_MARKERS = [
  'How we count your balance',
  'Winged sun with your allocation',
  'Where it lives and where it can go',
  'Route to Polkaswap',
  '--fw-chart-1',
  'dashboard-v1',
  'allWalletsPanel',
  'portfolioOrbit',
];
/** File names of its screens and of the four layers of the winged sun it draws. */
export const DASHBOARD_FILE_PATTERNS = [
  /(Portfolio(Dashboard|Hero|Sky|AllWallets|ScopeRow|CountingSheet|SyncSheet|Sheet|Orbit|ReadinessChip|RouteCard|Breakdown|CheckList|SwapSheet|MoveSheet)|TokenLocations)/,
  /(^|\/)(wings|uraeus-left|uraeus-right|sun-disc)(-[\w-]+)?\.svg$/,
];

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) yield* files(full);
    else if (entry.isFile()) yield full;
  }
}

/** Every way the build at `directory` carries the dashboard; empty when it does not. */
export async function findDashboardInBuild(directory) {
  const problems = [];

  for await (const file of files(directory)) {
    const relative = path.relative(directory, file).split(path.sep).join('/');

    if (DASHBOARD_FILE_PATTERNS.some((pattern) => pattern.test(relative))) problems.push(`${relative}: a dashboard file`);
    if (!/\.(js|mjs|css|html|json|svg)$/.test(relative)) continue;

    const text = await readFile(file, 'utf8');

    for (const marker of DASHBOARD_MARKERS) if (text.includes(marker)) problems.push(`${relative}: contains "${marker}"`);
  }

  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? 'dist/extension/chrome');
  const problems = await findDashboardInBuild(directory);

  if (problems.length) {
    console.error(`The build at ${directory} carries the portfolio dashboard:\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    process.exit(1);
  }
  console.info(`The build at ${directory} carries no part of the portfolio dashboard.`);
}
