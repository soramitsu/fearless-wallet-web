import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import { commonViteConfig } from '../vite.config.shared.mjs';

const require = createRequire(import.meta.url);
const makeManifest = require('../src/extension/makeManifest.cjs');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex === -1 ? 'production' : process.argv[modeIndex + 1];
const browser = process.env.EXTENSION_TYPE || 'chrome';
const outputDir = process.env.OUTPUT_DIR || browser;
const outDir = path.resolve(root, 'dist/extension', outputDir);

function withBuild(overrides, configOptions = {}) {
  const config = commonViteConfig({
    mode,
    outDir,
    emptyOutDir: false,
    publicDir: false,
    ...configOptions,
  });

  return {
    ...config,
    configFile: false,
    base: './',
    build: {
      ...config.build,
      minify: mode === 'production',
      watch: watch ? {} : null,
      ...overrides,
      rollupOptions: {
        ...config.build.rollupOptions,
        ...(overrides.rollupOptions || {}),
        output: {
          ...config.build.rollupOptions.output,
          ...(overrides.rollupOptions?.output || {}),
        },
      },
    },
  };
}

function manualVendorChunk(id) {
  const normalizedId = id.split(path.sep).join('/');
  const marker = '/node_modules/';
  const markerIndex = normalizedId.lastIndexOf(marker);

  if (markerIndex === -1) return undefined;

  const packagePath = normalizedId.slice(markerIndex + marker.length);
  const [scopeOrName, scopedName] = packagePath.split('/');
  const packageName = scopeOrName.startsWith('@') ? `${scopeOrName}/${scopedName}` : scopeOrName;

  return `vendor/${packageName.replace(/^@/, '').replace('/', '-')}`;
}

async function copyRecursive(from, to) {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });

  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);

    if (entry.isDirectory()) await copyRecursive(source, target);
    else await fs.copyFile(source, target);
  }
}

async function writeStaticAssets() {
  await copyRecursive(path.resolve(root, 'public/icons'), path.join(outDir, 'icons'));
  await fs.copyFile(path.resolve(root, 'public/favicon.ico'), path.join(outDir, 'favicon.ico'));
  await fs.writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(makeManifest(browser), null, 2)}\n`);
}

async function normalizePopupHtml() {
  const nestedPopup = path.join(outDir, 'src/extension/popup.html');
  const rootPopup = path.join(outDir, 'popup.html');
  const html = await fs.readFile(nestedPopup, 'utf8');

  await fs.writeFile(rootPopup, html.replaceAll('../../', './'));
}

async function run() {
  if (!watch) await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await build(
    withBuild({
      outDir,
      rollupOptions: {
        input: path.resolve(root, 'src/extension/popup.html'),
      },
    })
  );
  await normalizePopupHtml();

  await build(
    withBuild({
      rollupOptions: {
        input: {
          background: path.resolve(root, 'src/extension/entry/background.ts'),
        },
        output: {
          entryFileNames: 'background.js',
          chunkFileNames: 'chunks/background-[name]-[hash].js',
          manualChunks: manualVendorChunk,
        },
      },
    })
  );

  for (const [entryName, globalName] of [
    ['content', 'FearlessContentScript'],
    ['page', 'FearlessInjectedPage'],
  ]) {
    await build(
      withBuild(
        {
          lib: {
            entry: path.resolve(root, `src/extension/entry/${entryName}.ts`),
            name: globalName,
            formats: ['iife'],
            fileName: () => `${entryName}.js`,
          },
          rollupOptions: {
            output: {
              entryFileNames: `${entryName}.js`,
            },
          },
        },
        { asyncWasm: false }
      )
    );
  }

  await writeStaticAssets();

  if (watch) {
    console.info(`Watching extension build in ${outDir}`);
    process.stdin.resume();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
