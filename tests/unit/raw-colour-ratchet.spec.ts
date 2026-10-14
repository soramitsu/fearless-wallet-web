// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertBaselineShrinks,
  auditRawColours,
  BASELINE_PATH,
  compareSites,
  parseBaseline,
  rawColourSites,
  scanRawColours,
} from '../../scripts/check-raw-colours.mjs';

const roots: string[] = [];
const path = 'src/components/PublicFixture.vue';
const baseline = (sites: ReturnType<typeof rawColourSites>) => ({
  schemaVersion: 1,
  sourceCommit: 'a'.repeat(40),
  sites,
});
const fixture = (source: string) => {
  const root = mkdtempSync(join(tmpdir(), 'fearless-colours-'));
  roots.push(root);
  mkdirSync(join(root, dirname(path)), { recursive: true });
  mkdirSync(join(root, 'config'));
  writeFileSync(join(root, path), source);
  writeFileSync(join(root, BASELINE_PATH), JSON.stringify(baseline(rawColourSites(path, source))));
  return root;
};
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('raw colour adoption ratchet', () => {
  it('checks every current Vue source against exact legacy sites', () => {
    const root = resolve(__dirname, '../..');
    const saved = parseBaseline(JSON.parse(readFileSync(join(root, BASELINE_PATH), 'utf8')));
    expect(compareSites(scanRawColours(root), saved.sites)).toEqual({ added: [], stale: [] });
  });

  it('finds short, alpha, uppercase, script, template and multiline RGB literals', () => {
    const source = `<template><div style="color:#ABCD" /></template>
<script>const ink = '#ABCDEF80';</script>
<style>.a { color: #abc; border-color:#AABBCC; background: RGB(
  1 2 3 / .5
); box-shadow: 0 0 1px rgba(1, 2, 3, .4); }</style>`;
    const sites = rawColourSites(path, source);
    expect(sites.reduce((total, site) => total + site.count, 0)).toBe(6);
    expect(sites.some((site) => site.source.includes('1 2 3 / .5'))).toBe(true);
    const changed = rawColourSites(path, source.replace('1 2 3 / .5', '1 2 4 / .5'));
    expect(compareSites(changed, sites).added.length).toBeGreaterThan(0);
  });

  it('exempts only the theme folder and does not confuse longer identifiers with hex colours', () => {
    expect(rawColourSites('src/styles/Fixture.vue', 'color:#fff')).toEqual([]);
    expect(rawColourSites('src/styles-old/Fixture.vue', 'color:#fff')).toHaveLength(1);
    expect(rawColourSites(path, '<template #default><a href="#abcdefghi" /></template>')).toEqual([]);
    expect(rawColourSites(path, 'color:var(--fw-text-1);')).toEqual([]);
  });

  it('rejects additions, changed colours and same-file duplicate occurrences', () => {
    const root = fixture('<style>.a { color:#fff; }</style>');
    const original = readFileSync(join(root, path), 'utf8');
    for (const source of [
      original + '\n' + original,
      original.replace('#fff', '#ffe'),
      original + '\n<style>.b { color:rgb(1,2,3); }</style>',
    ]) {
      writeFileSync(join(root, path), source);
      expect(() => auditRawColours(root)).toThrow(/Raw-colour drift/);
    }
  });

  it('requires obsolete exceptions to be removed, then accepts the smaller inventory', () => {
    const root = fixture('color:#fff;');
    writeFileSync(join(root, path), 'color:var(--fw-text-1);');
    expect(() => auditRawColours(root)).toThrow(/stale/);
    writeFileSync(join(root, BASELINE_PATH), JSON.stringify(baseline([])));
    expect(auditRawColours(root).occurrences).toBe(0);
  });

  it('does not reuse exceptions after a file move or colour-context change', () => {
    const original = rawColourSites(path, 'color:#fff;');
    expect(compareSites(rawColourSites('src/Other.vue', 'color:#fff;'), original).added).toHaveLength(1);
    expect(compareSites(rawColourSites(path, 'background:#fff;'), original).added).toHaveLength(1);
    expect(compareSites(rawColourSites(path, '\n\n  color:#fff;  '), original)).toEqual({ added: [], stale: [] });
  });

  it('rejects malformed, duplicate, wildcard and zero-count exceptions', () => {
    const site = rawColourSites(path, 'color:#fff;')[0];
    for (const sites of [
      [site, site],
      [{ ...site, count: 0 }],
      [{ ...site, path: 'src/../Any.vue' }],
      [{ ...site, source: '*' }],
    ]) {
      expect(() => parseBaseline(baseline(sites))).toThrow();
    }
    expect(() => parseBaseline({ ...baseline([]), schemaVersion: 2 })).toThrow();
    expect(() => parseBaseline({ ...baseline([]), sourceCommit: 'HEAD' })).toThrow();
  });

  it('rejects baseline expansion even when an old colour is removed at the same time', () => {
    const previous = baseline(rawColourSites(path, 'color:#fff;\ncolor:#000;'));
    expect(() => assertBaselineShrinks(baseline(rawColourSites(path, 'color:#fff;')), previous)).not.toThrow();
    expect(() => assertBaselineShrinks(baseline(rawColourSites(path, 'color:#ffe;')), previous)).toThrow(/only shrink/);
    expect(() => assertBaselineShrinks(baseline(rawColourSites(path, 'color:#fff;\ncolor:#fff;')), previous)).toThrow(
      /only shrink/
    );
  });

  it('does not silently skip linked source files', () => {
    const root = fixture('color:#fff;');
    symlinkSync(join(root, path), join(root, 'src', 'Bypass.vue'));
    expect(() => scanRawColours(root)).toThrow(/symlink/);
  });

  it('compares the actual Git base and rejects restoring a previously retired exception', () => {
    const root = fixture('color:#fff;');
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    git('init', '-q');
    git('add', '.');
    const commit = () =>
      git(
        '-c',
        'user.name=Public fixture',
        '-c',
        'user.email=fixture@example.invalid',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-qm',
        'fixture'
      );
    commit();
    expect(auditRawColours(root, 'HEAD').baselineComparison).toMatch(/only shrinks/);
    writeFileSync(join(root, path), 'color:var(--fw-text-1);');
    writeFileSync(join(root, BASELINE_PATH), JSON.stringify(baseline([])));
    expect(auditRawColours(root, 'HEAD').occurrences).toBe(0);
    git('add', '.');
    commit();
    writeFileSync(join(root, path), 'color:#fff;');
    writeFileSync(join(root, BASELINE_PATH), JSON.stringify(baseline(rawColourSites(path, 'color:#fff;'))));
    expect(() => auditRawColours(root, 'HEAD')).toThrow(/only shrink/);
    expect(() => auditRawColours(root, 'missing-reference')).toThrow();
  });
});
