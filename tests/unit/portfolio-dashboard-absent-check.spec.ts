// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import { findDashboardInBuild } from '../../scripts/check-portfolio-dashboard-absent.mjs';

const roots: string[] = [];
const build = (files: Record<string, string>) => {
  const root = mkdtempSync(join(tmpdir(), 'fearless-dashboard-absent-'));

  roots.push(root);
  Object.entries(files).forEach(([name, content]) => {
    mkdirSync(join(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), content);
  });

  return root;
};
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('check that a build carries no portfolio dashboard', () => {
  it('passes a build with none of it, whatever else the build holds', async () => {
    const root = build({
      'popup.js': 'console.log("portfolio");',
      'chunks/router.js': 'name(){return this.$t(`portfolioDashboard.allWallets`)}',
      'assets/winged-sun-colour-abc123.svg': '<svg></svg>',
    });

    expect(await findDashboardInBuild(root)).toEqual([]);
  });

  it('finds the dashboard by its strings, styles and storage key', async () => {
    const root = build({
      'chunks/a.js': 'x("How we count your balance")',
      'assets/b.css': ':root{--fw-chart-1:#f09}',
      'chunks/c.js': 'k("dashboard-v1")',
      'chunks/d.js': 'y("Where it lives and where it can go")',
      'chunks/e.js': 'z("Route to Polkaswap")',
    });

    expect((await findDashboardInBuild(root)).sort()).toEqual([
      'assets/b.css: contains "--fw-chart-1"',
      'chunks/a.js: contains "How we count your balance"',
      'chunks/c.js: contains "dashboard-v1"',
      'chunks/d.js: contains "Where it lives and where it can go"',
      'chunks/e.js: contains "Route to Polkaswap"',
    ]);
  });

  it('finds the dashboard by its screens and the layers of the sun it draws', async () => {
    const root = build({
      'chunks/PortfolioDashboard.js': 'export {}',
      'chunks/TokenLocations.js': 'export {}',
      'chunks/PortfolioOrbit.js': 'export {}',
      'assets/wings-9f8e7d.svg': '<svg></svg>',
      'assets/uraeus-left.svg': '<svg></svg>',
    });

    expect((await findDashboardInBuild(root)).sort()).toEqual([
      'assets/uraeus-left.svg: a dashboard file',
      'assets/wings-9f8e7d.svg: a dashboard file',
      'chunks/PortfolioDashboard.js: a dashboard file',
      'chunks/PortfolioOrbit.js: a dashboard file',
      'chunks/TokenLocations.js: a dashboard file',
    ]);
  });
});
