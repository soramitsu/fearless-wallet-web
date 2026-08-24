import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import vue from '@vitejs/plugin-vue';
import fg from 'fast-glob';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import topLevelAwait from 'vite-plugin-top-level-await';
import wasm from 'vite-plugin-wasm';

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
  'VUE_APP_ENABLE_IROHA_TRANSFERS',
  'VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY',
  'VUE_APP_IROHA_TRANSFER_COMPATIBILITY',
  'VUE_APP_TRANSFER_TESTING',
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

function createSymbolId(template, file) {
  return template.replace('[name]', path.basename(file, '.svg'));
}

function svgToSymbol(svg, id) {
  const svgMatch = svg.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
  if (!svgMatch) return '';

  const [, attrs, body] = svgMatch;
  const viewBox = attrs.match(/\bviewBox=(["'])(.*?)\1/i)?.[2] ?? '0 0 24 24';

  return `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
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

  return `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>`;
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

export function makeDefine(mode, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const nodeEnv = mode === 'production' ? 'production' : 'development';
  const define = {
    'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    'process.env.BASE_URL': JSON.stringify('./'),
  };

  for (const key of ENV_KEYS) {
    define[`process.env.${key}`] = JSON.stringify(env[key] ?? '');
  }

  return define;
}

export function commonViteConfig({ mode, outDir, emptyOutDir = true, publicDir = 'public', asyncWasm = true }) {
  if (process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS === 'true') {
    if (process.env.VUE_APP_TRANSFER_TESTING !== 'true') {
      throw new Error(
        'bitcoin_testnet_broadcast_evidence_missing: Bitcoin transfers must remain disabled until the funded testnet release evidence is ready'
      );
    }
    if (process.env.VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY !== 'testnet-only') {
      throw new Error('invalid_bitcoin_transfer_network_policy');
    }
  }

  if (process.env.VUE_APP_ENABLE_IROHA_TRANSFERS === 'true') {
    if (process.env.VUE_APP_TRANSFER_TESTING !== 'true') {
      throw new Error(
        'browser_transaction_codec_unpublished_source_only: local browser codec source is not a reviewed immutable release artifact; Iroha transfers must remain disabled in every build mode'
      );
    }
    if (process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY !== 'legacy-offline-only') {
      throw new Error('invalid_iroha_transfer_compatibility');
    }
  }

  if (
    process.env.VUE_APP_TRANSFER_TESTING === 'true' &&
    (mode !== 'production' ||
      process.env.IS_EXTENSION !== 'true' ||
      process.env.VUE_APP_ENABLE_BITCOIN_TRANSFERS !== 'true' ||
      process.env.VUE_APP_ENABLE_IROHA_TRANSFERS !== 'true' ||
      process.env.VUE_APP_BITCOIN_TRANSFER_NETWORK_POLICY !== 'testnet-only' ||
      process.env.VUE_APP_IROHA_TRANSFER_COMPATIBILITY !== 'legacy-offline-only' ||
      process.env.VUE_APP_TEST_ONLY === 'true' ||
      process.env.VUE_APP_EXTENSION_SMOKE === 'true')
  ) {
    throw new Error('invalid_transfer_test_profile: transfer testing requires both send paths in a production extension');
  }

  return {
    publicDir,
    plugins: [
      vue(),
      ...(asyncWasm ? [wasm(), topLevelAwait()] : []),
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
    ],
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
            @use "@/styles/common.scss" as *;
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
      target: 'es2020',
      cssCodeSplit: true,
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
