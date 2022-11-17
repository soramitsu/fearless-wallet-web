const { defineConfig } = require('@vue/cli-service');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const baseConfig = require('./vue.config.base');

module.exports = defineConfig({
  ...baseConfig,
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    // bundle all dependencies from node_modules to vendors
    // config.optimization.splitChunks.cacheGroups.defaultVendors.chunks = 'all';
    // config.optimization.splitChunks.cacheGroups.common.chunks = 'all';
    // prepare icons content to unicode
    config.module.rules
      .filter((rule) => rule.test.toString().indexOf('scss') !== -1)
      .forEach((rule) => {
        rule.oneOf.forEach((oneOfRule) => {
          oneOfRule.use.splice(oneOfRule.use.indexOf(require.resolve('sass-loader')), 0, {
            loader: require.resolve('css-unicode-loader'),
          });
        });
      });

    if (process.env.NODE_ENV === 'production') {
      const buildDateTime = Date.now();

      config.output.filename = `js/[name].[contenthash:8].${buildDateTime}.js`;
      config.output.chunkFilename = `js/[name].[contenthash:8].${buildDateTime}.js`;
    }
  },
  pluginOptions: {
    electronBuilder: {
      nodeIntegration: true,
      mainProcessFile: 'src/desktop/background.ts',
      builderOptions: {
        productName: 'Fearless Wallet',
        appId: 'com.soramitsu.fearless-wallet',
        copyright: 'Copyright © 2022 Soramitsu',
        directories: {
          buildResources: 'public',
        },
        // files: [
        //   './node_modules/@soramitsu/soramitsu-js-ui/lib/assets/fonts/*',
        //   './node_modules/@soramitsu/soramitsu-js-ui/lib/assets/styles/index.scss',
        // ],
        mac: {
          icon: './public/icons/logo.icns',
          category: 'public.app-category.finance',
        },
        win: {
          target: ['nsis', 'msi'],
          icon: './public/icons/logo-256.png',
        },
        linux: {
          category: 'Finance',
          target: ['deb', 'snap', 'AppImage'],
          // 'rpm' - to build rpm, executable rpmbuild is required, please install: brew install rpm
        },
      },
    },
  },
});
