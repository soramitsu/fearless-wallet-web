const path = require('path');

function resolve(dir) {
  return path.join(__dirname, dir);
}

module.exports = {
  publicPath: './',
  css: {
    loaderOptions: {
      sass: {
        additionalData: `
          @use "@soramitsu-ui/theme/sass" as theme;
          @import "@/styles/_layout.scss";
          @import "@/styles/_mixins.scss";
          @import "@/styles/common.scss";
        `,
      },
      postcss: {
        postcssOptions: {
          plugins: [['autoprefixer']],
        },
      },
    },
  },
  devServer: {
    client: {
      overlay: {
        errors: false,
        warnings: false,
        runtimeErrors: false,
      },
    },
  },
  productionSourceMap: true,
  configureWebpack: (config) => {
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
    };

    const moduleConfig = config.module ?? {};
    const existingRules = moduleConfig.rules ?? [];

    moduleConfig.rules = [
      ...existingRules,
      {
        test: /\.wasm$/,
        type: 'webassembly/async',
      },
    ];

    config.module = moduleConfig;
  },
  chainWebpack: (config) => {
    config.plugins.delete('eslint');

    config.plugin('define').tap((definitions) => {
      const def = definitions[0]['process.env'];

      def.IS_EXTENSION = JSON.stringify(process.env.IS_EXTENSION);
      def.OAUTH_CLIENT_ID = JSON.stringify(process.env.OAUTH_CLIENT_ID);
      def.RAMP_TEST_API_KEY = JSON.stringify(process.env.RAMP_TEST_API_KEY);
      def.RAMP_PROD_API_KEY = JSON.stringify(process.env.RAMP_PROD_API_KEY);
      def.MOONPAY_TEST_API_KEY = JSON.stringify(process.env.MOONPAY_TEST_API_KEY);
      def.MOONPAY_PROD_API_KEY = JSON.stringify(process.env.MOONPAY_PROD_API_KEY);
      def.FL_WEB_TON_API_KEY = JSON.stringify(process.env.FL_WEB_TON_API_KEY);
      def.FL_DWELLIR_API_KEY = JSON.stringify(process.env.FL_DWELLIR_API_KEY);
      def.FL_WEB_ETHERSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_ETHERSCAN_API_KEY);
      def.FL_WEB_BSCSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_BSCSCAN_API_KEY);
      def.FL_WEB_POLYGONSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_POLYGONSCAN_API_KEY);
      def.FL_BLAST_API_ETHEREUM_KEY = JSON.stringify(process.env.FL_BLAST_API_ETHEREUM_KEY);
      def.FL_BLAST_API_BSC_KEY = JSON.stringify(process.env.FL_BLAST_API_BSC_KEY);
      def.FL_BLAST_API_SEPOLIA_KEY = JSON.stringify(process.env.FL_BLAST_API_SEPOLIA_KEY);
      def.FL_BLAST_API_GOERLI_KEY = JSON.stringify(process.env.FL_BLAST_API_GOERLI_KEY);
      def.FL_BLAST_API_POLYGON_KEY = JSON.stringify(process.env.FL_BLAST_API_POLYGON_KEY);
      def.FL_WEB_ALCHEMY_API_ETHEREUM_KEY = JSON.stringify(process.env.FL_WEB_ALCHEMY_API_ETHEREUM_KEY);
      def.FL_BLAST_API_MOONBEAM_KEY = JSON.stringify(process.env.FL_BLAST_API_MOONBEAM_KEY);
      def.FL_BLAST_API_MOONRIVER_KEY = JSON.stringify(process.env.FL_BLAST_API_MOONRIVER_KEY);
      def.FL_BLAST_API_OKTC_MAINNET_KEY = JSON.stringify(process.env.FL_BLAST_API_OKTC_MAINNET_KEY);
      def.FL_BLAST_API_OPTIMISM_MAINNET_KEY = JSON.stringify(process.env.FL_BLAST_API_OPTIMISM_MAINNET_KEY);
      def.FL_WEB_ARBISCAN_API_KEY = JSON.stringify(process.env.FL_WEB_ARBISCAN_API_KEY);
      def.FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_OPTIMISTIC_ETHERSCAN_API_KEY);
      def.FL_WEB_SNOWTRACE_API_KEY = JSON.stringify(process.env.FL_WEB_SNOWTRACE_API_KEY);
      def.FL_WEB_ZKEVM_POLYGONSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_ZKEVM_POLYGONSCAN_API_KEY);

      return definitions;
    });
    config.resolve.alias
      .set('@extension-base', path.resolve(__dirname, 'src/extension/background/extension-base/src'))
      .set('@sora', path.resolve(__dirname, 'src/sora'))
      .set('@polkadot/keyring', path.dirname(require.resolve('@polkadot/keyring/package.json')))
      .set(
        '@polkadot/ui-keyring/node_modules/@polkadot/keyring',
        path.dirname(require.resolve('@polkadot/keyring/package.json'))
      )
      .set(
        '@polkadot/ui-keyring/node_modules/@polkadot/keyring/pair',
        path.join(path.dirname(require.resolve('@polkadot/keyring/package.json')), 'pair')
      )
      .set(
        '@polkadot/ui-keyring/node_modules/@polkadot/keyring/pair/index.js',
        path.resolve(__dirname, 'src/shims/polkadot-keyring-pair.js')
      )
      .set(
        '@polkadot/keyring/pair$',
        path.join(path.dirname(require.resolve('@polkadot/keyring/package.json')), 'pair/index.js')
      )
      .set('@polkadot/keyring/pair/index.js', path.resolve(__dirname, 'src/shims/polkadot-keyring-pair.js'));

    config.module.rule('svg').exclude.add(resolve('src/assets')).end();
    config.module
      .rule('icons')
      .test(/\.svg$/)
      .include.add(resolve('src/assets'))
      .end()
      .use('svg-sprite-loader')
      .loader('svg-sprite-loader')
      .options({
        symbolId: 'icon-[name]',
      })
      .end();

    config.optimization.merge({
      splitChunks: {
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/](vue|qrcode|file-saver|vuedraggable|tippy.js|vue-router|vue-i18n)[\\/]/,
            name: 'vendor',
            chunks: 'all',
          },
        },
      },
    });

    config.merge({
      experiments: {
        asyncWebAssembly: true,
      },
    });

    config.module
      .rule('wasm')
      .test(/\.wasm$/)
      .set('type', 'webassembly/async');
  },
};
