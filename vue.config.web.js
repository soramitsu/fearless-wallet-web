const { defineConfig } = require('@vue/cli-service');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

const baseConfig = require('./vue.config.base');

module.exports = defineConfig({
  ...baseConfig,
  configureWebpack: (config) => {
    config.output.filename = '[name].js';
    config.output.chunkFilename = '[name].js';

    console.info(config.output);
    config.entry = {
      ...config.entry,
      'service-worker': './src/extension/entry/background-web.ts',
    };

    config.plugins.push(new NodePolyfillPlugin());

    config.module.rules
      .filter((rule) => rule.test.toString().indexOf('scss') !== -1)
      .forEach((rule) => {
        rule.oneOf.forEach((oneOfRule) => {
          oneOfRule.use.splice(oneOfRule.use.indexOf(require.resolve('sass-loader')), 0, {
            loader: require.resolve('css-unicode-loader'),
          });
        });
      });
  },
});
