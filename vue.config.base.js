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
      definitions[0]['process.env'].EXTENSION_PREFIX = JSON.stringify(process.env.EXTENSION_PREFIX);
      definitions[0]['process.env'].OAUTH_CLIENT_ID = JSON.stringify(process.env.OAUTH_CLIENT_ID);
      definitions[0]['process.env'].PORT_PREFIX = JSON.stringify(process.env.PORT_PREFIX);
      definitions[0]['process.env'].RAMP_TEST_API_KEY = JSON.stringify(process.env.RAMP_TEST_API_KEY);
      definitions[0]['process.env'].RAMP_PROD_API_KEY = JSON.stringify(process.env.RAMP_PROD_API_KEY);
      definitions[0]['process.env'].MOONPAY_TEST_API_KEY = JSON.stringify(process.env.MOONPAY_TEST_API_KEY);
      definitions[0]['process.env'].MOONPAY_PROD_API_KEY = JSON.stringify(process.env.MOONPAY_PROD_API_KEY);
      definitions[0]['process.env'].ETHERSCAN_API_KEY = JSON.stringify(process.env.ETHERSCAN_API_KEY);

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
            test: /[\\/]node_modules[\\/](vue|qrcode|file-saver|vuedraggable|tippy.js|vue-class-component|@airgap)[\\/]/,
            name: 'vendor',
            chunks: 'all',
          },
        },
      },
    });
  },
};
