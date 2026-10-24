import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import fg from 'fast-glob';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import { keystoreScryptParamsPlugin } from './scripts/keystore-scrypt-params.mjs';
import { subwalletPackageCompatPlugin } from './scripts/subwallet-package-compat.mjs';
import { svgToSymbol, wrapSvgSymbols } from './scripts/svg-symbol.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV_KEYS = [
  'BASE_URL',
  'NODE_ENV',
  'IS_EXTENSION',
  'OAUTH_CLIENT_ID',
  'RAMP_TEST_API_KEY',
  'RAMP_PROD_API_KEY',
  'MOONPAY_TEST_API_KEY',
  'MOONPAY_PROD_API_KEY',
  'FL_WEB_TON_API_KEY',
  'FL_DWELLIR_API_KEY',
  'FL_WEB_ETHERSCAN_API_KEY',
  'FL_WEB_BSCSCAN_API_KEY',
  'FL_WEB_POLYGONSCAN_API_KEY',
  'FL_BLAST_API_ETHEREUM_KEY',
  'FL_BLAST_API_BSC_KEY',
  'FL_BLAST_API_SEPOLIA_KEY',
  'FL_BLAST_API_GOERLI_KEY',
  'FL_BLAST_API_POLYGON_KEY',
  'FL_WEB_ALCHEMY_API_ETHEREUM_KEY',
  'FL_BLAST_API_MOONBEAM_KEY',
  'FL_BLAST_API_MOONRIVER_KEY',
  'FL_BLAST_API_OKTC_MAINNET_KEY',
  'FL_BLAST_API_OPTIMISM_MAINNET_KEY',
  'FL_WEB_ARBISCAN_API_KEY',
  'FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY',
  'FL_WEB_SNOWTRACE_API_KEY',
  'FL_WEB_ZKEVM_POLYGONSCAN_API_KEY',
  'VUE_APP_ENABLE_BITCOIN_TRANSFERS',
  'VUE_APP_ENABLE_IROHA_CONNECT',
  'VUE_APP_ENABLE_IROHA_TRANSFERS',
  'VUE_APP_ENABLE_SOLANA_TRANSFERS',
  'VUE_APP_EXTENSION_SMOKE',
  'VUE_APP_TEST_ONLY',
  'VUE_APP_FL_WEB_X1_TESTNET_API_KEY',
];

const SVG_REGISTER_MODULE = 'virtual:svg-icons-register';
const RESOLVED_SVG_REGISTER_MODULE = `\0${SVG_REGISTER_MODULE}`;
const CARDANO_SERIALIZATION_BROWSER = '@emurgo/cardano-serialization-lib-browser';
const CARDANO_MESSAGE_SIGNING_BROWSER = path.resolve(
  __dirname,
  'node_modules/@emurgo/cardano-message-signing-browser/cardano_message_signing.js'
);
const NOOP_DEVTOOLS_API = path.resolve(__dirname, 'src/util/noopDevtoolsApi.ts');
const VUEDRAGGABLE_ESM = path.resolve(__dirname, 'node_modules/vuedraggable/src/vuedraggable.js');
const UNSUPPORTED_NODE_VM = path.resolve(__dirname, 'src/util/unsupportedNodeVm.ts');
const IROHA_SDK_DIST = path.join('node_modules', '@iroha', 'iroha-js', 'dist') + path.sep;
const IROHA_SDK_BROWSER_BINDING = path.resolve(__dirname, 'src/util/irohaSdkBrowserBinding.ts');

// The Iroha SDK reaches its Rust binding through `native.js`; browsers get the wallet's
// I105 address binding instead (see src/util/irohaSdkBrowserBinding.ts).
function irohaSdkBrowserBindingPlugin() {
  return {
    name: 'fearless-iroha-sdk-browser-binding',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || (source !== './native.js' && source !== '../native.js')) return null;

      return path.normalize(importer.split('?')[0]).includes(IROHA_SDK_DIST) ? IROHA_SDK_BROWSER_BINDING : null;
    },
  };
}

function createSymbolId(template, file) {
  return template.replace('[name]', path.basename(file, '.svg'));
}

async function loadSvgSprite(iconDirs, symbolId, pluginContext) {
  const files = (
    await Promise.all(iconDirs.map((dir) => fg('*.svg', { absolute: true, cwd: dir, onlyFiles: true })))
  )
    .flat()
    .sort();

  const symbols = await Promise.all(
    files.map(async (file) => {
      pluginContext.addWatchFile(file);

      return svgToSymbol(await fs.readFile(file, 'utf8'), createSymbolId(symbolId, file));
    })
  );

  return wrapSvgSymbols(symbols);
}

function svgSpritePlugin({ iconDirs, symbolId }) {
  return {
    name: 'fearless-svg-sprite',
    resolveId(id) {
      if (id === SVG_REGISTER_MODULE) return RESOLVED_SVG_REGISTER_MODULE;

      return null;
    },
    async load(id) {
      if (id !== RESOLVED_SVG_REGISTER_MODULE) return null;

      const sprite = await loadSvgSprite(iconDirs, symbolId, this);

      return `
const sprite = ${JSON.stringify(sprite)};
const mountSprite = () => {
  if (document.getElementById('__fearless_svg_sprite__')) return;

  const spriteContainer = document.createElement('div');
  spriteContainer.id = '__fearless_svg_sprite__';
  spriteContainer.style.display = 'none';
  const spriteDocument = new DOMParser().parseFromString(sprite, 'image/svg+xml');
  if (spriteDocument.querySelector('parsererror')) throw new Error('Wallet artwork could not load.');
  const spriteElement = document.importNode(spriteDocument.documentElement, true);

  spriteContainer.appendChild(spriteElement);
  document.body.insertBefore(spriteContainer, document.body.firstChild);
};

if (typeof document !== 'undefined') {
  if (document.body) mountSprite();
  else document.addEventListener('DOMContentLoaded', mountSprite, { once: true });
}

export default sprite;
`;
    },
  };
}

// The SIL Open Font License asks for its text beside the fonts, so every build that bundles font files ships these.
export const FONT_LICENSES = Object.freeze({
  'licenses/fonts/Inter-OFL.txt': 'src/assets/fonts/inter/OFL.txt',
  'licenses/fonts/JetBrainsMono-OFL.txt': 'node_modules/@fontsource/jetbrains-mono/LICENSE',
  'licenses/fonts/NotoSansCuneiform-OFL.txt': 'node_modules/@fontsource/noto-sans-cuneiform/LICENSE',
  'licenses/fonts/NotoSansEgyptianHieroglyphs-OFL.txt': 'node_modules/@fontsource/noto-sans-egyptian-hieroglyphs/LICENSE',
  'licenses/fonts/Sora-OFL.txt': 'node_modules/@fontsource-variable/sora/LICENSE',
});

export function fontLicensesPlugin() {
  return {
    name: 'fearless-font-licenses',
    async generateBundle(_options, bundle) {
      if (!Object.keys(bundle).some((file) => /\.(?:woff2?|ttf|otf)$/u.test(file))) return;

      for (const [fileName, source] of Object.entries(FONT_LICENSES)) {
        this.emitFile({ type: 'asset', fileName, source: await fs.readFile(path.resolve(__dirname, source)) });
      }
    },
  };
}

export const FW_PALETTES = Object.freeze(['v1', 'legacy']);

// Build-time look (design-system 14.0 item 5): `v1` is Neon Glass, `legacy` the look this release replaced, kept so a
// hotfix can revert paint without touching data. It is not remote configuration.
export function resolveFwPalette(env = process.env) {
  const palette = env.VITE_FW_PALETTE || 'v1';

  if (!FW_PALETTES.includes(palette)) {
    throw new Error(`VITE_FW_PALETTE must be one of ${FW_PALETTES.join(', ')}; received ${JSON.stringify(palette)}`);
  }

  return palette;
}

export function makeDefine(mode, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const nodeEnv = mode === 'production' ? 'production' : 'development';
  const define = {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    'process.env.BASE_URL': JSON.stringify('./'),
    'process.env.VITE_FW_PALETTE': JSON.stringify(resolveFwPalette(env)),
  };

  for (const key of ENV_KEYS) {
    define[`process.env.${key}`] = JSON.stringify(env[key] ?? '');
  }

  return define;
}

// A send flag may only be enabled once its live-network evidence manifest is marked ready.
// The release audits verify the recorded evidence itself (on-chain status, artifact digest).
function assertTransferEvidenceReady(flag, manifestPath, errorCode, description) {
  if (process.env[flag] !== 'true') return;

  let manifest;

  try {
    manifest = JSON.parse(readFileSync(path.resolve(__dirname, manifestPath), 'utf8'));
  } catch {
    manifest = undefined;
  }

  if (manifest?.status !== 'ready' || manifest.releaseEnabled !== true) {
    throw new Error(`${errorCode}: ${description} stay disabled until ${manifestPath} records ready release evidence`);
  }
}

export function commonViteConfig({ mode, outDir, emptyOutDir = true, publicDir = 'public', asyncWasm = true, nativeAsyncModules = false }) {
  if (process.env.VUE_APP_ENABLE_IROHA_CONNECT === 'true' && mode === 'production') {
    throw new Error('iroha_connect_blind_signing_unreviewed: IrohaConnect must stay disabled until decoded-payload signing ships');
  }
  assertTransferEvidenceReady(
    'VUE_APP_ENABLE_BITCOIN_TRANSFERS',
    'scripts/bitcoin-testnet-broadcast-evidence.json',
    'bitcoin_testnet_broadcast_evidence_missing',
    'Bitcoin transfers'
  );
  assertTransferEvidenceReady(
    'VUE_APP_ENABLE_IROHA_TRANSFERS',
    'config/iroha-production-send-readiness.json',
    'iroha_transfer_evidence_missing',
    'Iroha transfers'
  );

  return {
    publicDir,
    plugins: [
      irohaSdkBrowserBindingPlugin(),
      vue(),
      subwalletPackageCompatPlugin(),
      keystoreScryptParamsPlugin(),
      ...(asyncWasm ? [wasm(), ...(nativeAsyncModules ? [] : [topLevelAwait()])] : []),
      nodePolyfills({
        include: ['buffer', 'crypto', 'events', 'http', 'https', 'os', 'stream', 'url', 'util', 'zlib'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
      svgSpritePlugin({
        iconDirs: [path.resolve(__dirname, 'src/assets/icons'), path.resolve(__dirname, 'src/assets/services')],
        symbolId: 'icon-[name]',
      }),
      fontLicensesPlugin(),
    ],
    optimizeDeps: { exclude: ['@subwallet/keyring', '@subwallet/ui-keyring'] },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@emurgo/cardano-message-signing-browser': CARDANO_MESSAGE_SIGNING_BROWSER,
        '@emurgo/cardano-serialization-lib-nodejs': CARDANO_SERIALIZATION_BROWSER,
        '@extension-base': path.resolve(__dirname, 'src/extension/background/extension-base/src'),
        ...(mode === 'production' ? { '@vue/devtools-api': NOOP_DEVTOOLS_API } : {}),
        store: path.resolve(__dirname, 'src/util/browserStore.ts'),
        vm: UNSUPPORTED_NODE_VM,
        'node:vm': UNSUPPORTED_NODE_VM,
        vuedraggable: VUEDRAGGABLE_ESM,
      },
    },
    define: makeDefine(mode),
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `
            @use "@/styles/_layout.scss" as *;
            @use "@/styles/_mixins.scss" as *;
            @use "@/styles/common.scss" as * with ($fw-palette: "${resolveFwPalette()}");
          `,
        },
      },
      postcss: {
        plugins: [],
      },
    },
    build: {
      outDir,
      emptyOutDir,
      sourcemap: mode !== 'production',
      // Supported browsers handle top-level await natively. Rewriting it into
      // exported promises breaks initialization across the popup's cyclic chunks.
      target: nativeAsyncModules ? 'es2022' : 'es2020',
      cssCodeSplit: true,
      // Extension CSP permits packaged fonts only, including tiny language subsets.
      assetsInlineLimit: (filePath) => /\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined,
      rollupOptions: {
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name].js',
          assetFileNames: 'assets/[name][extname]',
        },
      },
    },
  };
}
