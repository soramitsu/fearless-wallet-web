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
const transferTest = args.has('--transfer-test');
const modeIndex = process.argv.indexOf('--mode');
const mode = modeIndex === -1 ? 'production' : process.argv[modeIndex + 1];
const browser = process.env.EXTENSION_TYPE || 'chrome';
const outputDir = process.env.OUTPUT_DIR || browser;
const outDir = path.resolve(root, 'dist/extension', outputDir);
export const PRODUCTION_RELEASE_FLAGS = Object.freeze({
  VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY: 'disabled',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'false',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'false',
  VUE_APP_EXTENSION_SMOKE: 'false',
  VUE_APP_IROHA_TRANSFER_COMPATIBILITY: 'disabled',
  VUE_APP_TEST_ONLY: 'false',
  VUE_APP_TRANSFER_TESTING: 'false',
});
export const TRANSFER_TEST_RELEASE_FLAGS = Object.freeze({
  VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY: 'testnet-only',
  VUE_APP_ENABLE_BITCOIN_TRANSFERS: 'true',
  VUE_APP_ENABLE_IROHA_TRANSFERS: 'true',
  VUE_APP_EXTENSION_SMOKE: 'false',
  VUE_APP_IROHA_TRANSFER_COMPATIBILITY: 'legacy-offline-only',
  VUE_APP_TEST_ONLY: 'false',
  VUE_APP_TRANSFER_TESTING: 'true',
});
export const TRANSFER_TEST_EXTENSION_PUBLIC_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn+8GsdWVqfR8rNIzaVG1E63O7dMkK2REMTe0eFc/anBc+R3cCIIvTGbnXWphVawNmrfcMNCK0B7gnZBpiiDZ43Ues0xsqlZdtZdutQN7F1tDYId9zbSYGkow82jeKIBibUZ8V4e+SuMH6D6hT89LtlTsLFgXR6A+RTc16Xm4wdb1+5Z9q1hRnNX/gm9sme88EM4HNps+9tjKWaW1F4D1ugHnha9Yz8N7kMIV9Hp40+J4qZBieLMo4NBm+3TddwANA24ny2DHLP5tvr55J6eKfN3q94+H6+QOxQG7Hr8UmD/S4oPw4d2VCqoXI16Lvg0lPntA0vX9Fv+L5ks8/dMK9wIDAQAB';

export function enforceProductionReleaseEnvironment(environment, buildMode, { transferTest = false } = {}) {
  if (buildMode === 'production') {
    Object.assign(environment, transferTest ? TRANSFER_TEST_RELEASE_FLAGS : PRODUCTION_RELEASE_FLAGS);
    if (transferTest) {
      environment.EXTENSION_PUBLIC_KEY = TRANSFER_TEST_EXTENSION_PUBLIC_KEY;
      environment.OAUTH_CLIENT_ID = '';
    }
  }
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
        profile: transferTest ? 'transfer-test' : 'release',
        releaseFlags: Object.fromEntries(
          Object.keys(PRODUCTION_RELEASE_FLAGS).map((key) => [key, process.env[key] ?? ''])
        ),
        schemaVersion: 2,
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
  if (transferTest && (mode !== 'production' || watch || browser !== 'chrome')) {
    throw new Error('the transfer-test profile requires a non-watch production Chrome build');
  }
  enforceProductionReleaseEnvironment(process.env, mode, { transferTest });
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
      { buildTarget: 'popup' }
    )
  );
  await normalizePopupHtml();

  await build(
    withBuild(
      {
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
      },
      { buildTarget: 'background' }
    )
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
