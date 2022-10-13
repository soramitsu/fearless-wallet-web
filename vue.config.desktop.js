const path = require('path');
const { defineConfig } = require('@vue/cli-service');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const baseConfig = require('./vue.config.base');

module.exports = defineConfig({
  ...baseConfig,
  chainWebpack: (config) => {
    config.plugin('define').tap((definitions) => {
      definitions[0]['process.env'].EXTENSION_PREFIX = JSON.stringify(process.env.EXTENSION_PREFIX);
      definitions[0]['process.env'].PORT_PREFIX = JSON.stringify(process.env.PORT_PREFIX);

      return definitions;
    });
    config.resolve.alias.set('@extension-base', path.resolve(__dirname, 'src/extension/background/extension-base/src'));
    config.optimization.splitChunks({
      cacheGroups: {
        defaultVendors: {
          chunks: 'all',
        },
        common: {
          chunks: 'all',
        },
      },
    });
  },
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    // bundle all dependencies from node_modules to vendors
    // config.optimization.splitChunks.cacheGroups.defaultVendors.chunks = 'all';
    // config.optimization.splitChunks.cacheGroups.common.chunks = 'all';
    // prepare icons content to unicode
    config.module.rules
      .filter((rule) => {
        return rule.test.toString().indexOf('scss') !== -1;
      })
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
});
