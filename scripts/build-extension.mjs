import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { build, createLogger } from 'vite';

import { commonViteConfig } from '../vite.config.shared.mjs';
import { createFirefoxBuildLogPolicy, polkadotIifePackageInfoPlugin } from './firefox-build-warning-policy.mjs';

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
export const PRODUCTION_RELEASE_FLAGS = Object.freeze({
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'false',
  VUE_APP_TEST_ONLY: 'false',
});

export function enforceProductionReleaseEnvironment(environment, buildMode) {
  if (buildMode === 'production') Object.assign(environment, PRODUCTION_RELEASE_FLAGS);
  return environment;
}

function withBuild(overrides, configOptions = {}) {
  const { buildTarget, normalizePolkadotPackageInfo = false, ...sharedConfigOptions } = configOptions;
  const config = commonViteConfig({
    mode,
    outDir,
    emptyOutDir: false,
    publicDir: false,
    ...sharedConfigOptions,
  });
  const gateProductionWarnings = mode === 'production' && !watch;

  if (gateProductionWarnings && !buildTarget) {
    throw new Error('production extension builds must name a warning-policy target');
  }
  const buildLogPolicy = gateProductionWarnings
    ? createFirefoxBuildLogPolicy({ buildTarget, rootDir: root, baseLogger: createLogger() })
    : null;

  return {
    ...config,
    configFile: false,
    ...(buildLogPolicy ? { customLogger: buildLogPolicy.logger } : {}),
    base: './',
    plugins: [...config.plugins, ...(normalizePolkadotPackageInfo ? [polkadotIifePackageInfoPlugin()] : [])],
    build: {
      ...config.build,
      minify: mode === 'production',
      watch: watch ? {} : null,
      ...overrides,
      rollupOptions: {
        ...config.build.rollupOptions,
        ...(overrides.rollupOptions || {}),
        ...(buildLogPolicy ? { onLog: buildLogPolicy.onLog } : {}),
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
  await fs.writeFile(
    path.join(outDir, 'extension-build-metadata.json'),
    `${JSON.stringify(
      {
        browser,
        mode,
        releaseFlags: Object.fromEntries(
          Object.keys(PRODUCTION_RELEASE_FLAGS).map((key) => [key, process.env[key] ?? ''])
        ),
        schemaVersion: 1,
      },
      null,
      2
    )}\n`
  );
  if (process.env.VUE_APP_EXTENSION_SMOKE === 'true') {
    await fs.writeFile(
      path.join(outDir, 'smoke-control.html'),
      '<!doctype html><html><head><meta charset="utf-8"><title>Fearless extension smoke control</title></head><body></body></html>\n'
    );
  }
}

async function normalizePopupHtml() {
  const nestedPopup = path.join(outDir, 'src/extension/popup.html');
  const rootPopup = path.join(outDir, 'popup.html');
  const html = await fs.readFile(nestedPopup, 'utf8');

  await fs.writeFile(rootPopup, html.replaceAll('../../', './'));
}

async function run() {
  enforceProductionReleaseEnvironment(process.env, mode);
  if (!watch) await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  await build(
    withBuild(
      {
        outDir,
        rollupOptions: {
          input: path.resolve(root, 'src/extension/popup.html'),
        },
      },
      { buildTarget: 'popup', nativeAsyncModules: true }
    )
  );
  await normalizePopupHtml();

  await build(
    withBuild(
      {
        rollupOptions: {
          input: {
            background: path.resolve(root, 'src/extension/entry/backgroundRuntime.ts'),
          },
          preserveEntrySignatures: 'strict',
          output: {
            entryFileNames: 'background-runtime.js',
            chunkFileNames: 'chunks/background-[name]-[hash].js',
            manualChunks: manualVendorChunk,
          },
        },
      },
      { buildTarget: 'background' }
    )
  );

  // Keep MV3 wake listeners outside the async WASM dependency transform. Static
  // imports work in extension workers; dynamic import() is unsupported there.
  const bootstrapConfig = withBuild(
    {
      rollupOptions: {
        input: path.resolve(root, 'src/extension/entry/background.ts'),
        output: {
          entryFileNames: 'background.js',
        },
      },
    },
    { buildTarget: 'background', asyncWasm: false }
  );
  bootstrapConfig.plugins.push({
    name: 'external-background-runtime',
    enforce: 'pre',
    resolveId(source) {
      if (source === './backgroundRuntime') return { id: './background-runtime.js', external: true };
    },
  });
  await build(bootstrapConfig);

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
        {
          asyncWasm: false,
          buildTarget: entryName,
          normalizePolkadotPackageInfo: true,
        }
      )
    );
  }

  await writeStaticAssets();

  if (watch) {
    console.info(`Watching extension build in ${outDir}`);
    process.stdin.resume();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
