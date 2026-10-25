import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyLicenseAssets } from '../../scripts/copy-license-assets.mjs';

const sourceRoot = path.resolve(__dirname, '../..');

describe('static license assets', () => {
  it('includes exact Apache and third-party notices without changing built code', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'fearless-license-assets-'));
    try {
      await writeFile(path.join(outDir, 'background.js'), 'unchanged wallet code');
      await writeFile(path.join(outDir, 'NOTICE'), 'stale notice');
      await copyLicenseAssets({ sourceRoot, outDir });

      for (const [published, source] of [
        ['LICENSE', 'LICENSE'],
        ['NOTICE', 'NOTICE'],
        ['licenses/fonts/Unbounded-OFL.txt', 'src/assets/fonts/Unbounded-OFL.txt'],
      ]) {
        expect(await readFile(path.join(outDir, published))).toEqual(await readFile(path.join(sourceRoot, source)));
      }
      expect(await readFile(path.join(outDir, 'background.js'), 'utf8')).toBe('unchanged wallet code');
      expect(await readFile(path.join(outDir, 'LICENSE'), 'utf8')).toContain('Version 2.0, January 2004');
      expect(await readFile(path.join(outDir, 'licenses/fonts/Unbounded-OFL.txt'), 'utf8')).toContain(
        'SIL Open Font License, Version 1.1'
      );
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });

  it('fails the build when required license source files are missing', async () => {
    const emptyRoot = await mkdtemp(path.join(tmpdir(), 'fearless-missing-license-'));
    try {
      await expect(copyLicenseAssets({ sourceRoot: emptyRoot, outDir: path.join(emptyRoot, 'dist') })).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });
});
