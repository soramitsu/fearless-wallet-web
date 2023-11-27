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
  productionSourceMap: false,
  chainWebpack: (config) => {
    config.plugin('define').tap((definitions) => {
      const def = definitions[0]['process.env'];

      def.EXTENSION_PREFIX = JSON.stringify(process.env.EXTENSION_PREFIX);
      def.OAUTH_CLIENT_ID = JSON.stringify(process.env.OAUTH_CLIENT_ID);
      def.PORT_PREFIX = JSON.stringify(process.env.PORT_PREFIX);
      def.RAMP_TEST_API_KEY = JSON.stringify(process.env.RAMP_TEST_API_KEY);
      def.RAMP_PROD_API_KEY = JSON.stringify(process.env.RAMP_PROD_API_KEY);
      def.MOONPAY_TEST_API_KEY = JSON.stringify(process.env.MOONPAY_TEST_API_KEY);
      def.MOONPAY_PROD_API_KEY = JSON.stringify(process.env.MOONPAY_PROD_API_KEY);
      def.FL_WEB_ETHERSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_ETHERSCAN_API_KEY);
      def.FL_WEB_BSCSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_BSCSCAN_API_KEY);
      def.FL_WEB_POLYGONSCAN_API_KEY = JSON.stringify(process.env.FL_WEB_POLYGONSCAN_API_KEY);
      def.FL_BLAST_API_ETHEREUM_KEY = JSON.stringify(process.env.FL_BLAST_API_ETHEREUM_KEY);
      def.FL_BLAST_API_BSC_KEY = JSON.stringify(process.env.FL_BLAST_API_BSC_KEY);
      def.FL_BLAST_API_SEPOLIA_KEY = JSON.stringify(process.env.FL_BLAST_API_SEPOLIA_KEY);
      def.FL_BLAST_API_GOERLI_KEY = JSON.stringify(process.env.FL_BLAST_API_GOERLI_KEY);
      def.FL_BLAST_API_POLYGON_KEY = JSON.stringify(process.env.FL_BLAST_API_POLYGON_KEY);
      def.FL_ALCHEMY_API_ETHEREUM_KEY = JSON.stringify(process.env.FL_ALCHEMY_API_ETHEREUM_KEY);
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
    config.resolve.alias.set('@extension-base', path.resolve(__dirname, 'src/extension/background/extension-base/src'));

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
            test: /[\\/]node_modules[\\/](vue|qrcode|file-saver|element-ui|vuedraggable|tippy.js|vue-class-component)[\\/]/,
            name: 'vendor',
            chunks: 'all',
          },
        },
      },
    });
  },
};
