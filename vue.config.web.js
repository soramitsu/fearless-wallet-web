const { defineConfig } = require('@vue/cli-service');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
// const WorkboxPlugin = require('workbox-webpack-plugin');

const baseConfig = require('./vue.config.base');

module.exports = defineConfig({
  ...baseConfig,
  configureWebpack: (config) => {
    config.output.filename = '[name].js';
    config.output.chunkFilename = '[name].js';

    console.info(config.output);
    config.entry = {
      ...config.entry,
      'service-worker': './src/extension/entry/background.ts',
    };

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

    // if (process.env.NODE_ENV === 'production') {
    //   const buildDateTime = Date.now();
    //   config.output.filename = `js/[name].[contenthash:8].${buildDateTime}.js`;
    //   config.output.chunkFilename = `js/[name].[contenthash:8].${buildDateTime}.js`;
    // }
  },
});
