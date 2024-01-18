const { env } = require('process');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const WebpackExtensionManifestPlugin = require('webpack-extension-manifest-plugin');
const { defineConfig } = require('@vue/cli-service');
const baseConfig = require('./vue.config.base');
const makeManifest = require('./src/extension/makeManifest');

const pages = {
  popup: {
    entry: 'src/extension/entry/popup.ts',
    template: 'public/index.html',
    filename: 'popup.html',
    dependOn: 'vendors',
  },
  background: {
    entry: 'src/extension/entry/background.ts',
    template: 'public/index.html',
    filename: 'background.html',
  },
  content: {
    entry: 'src/extension/entry/content.ts',
    template: 'public/index.html',
    filename: 'content.html',
  },
  page: {
    entry: 'src/extension/entry/page.ts',
    template: 'public/index.html',
    filename: 'page.html',
  },
};

module.exports = defineConfig({
  ...baseConfig,
  pages,
  outputDir: `dist/extension/${env.OUTPUT_DIR}`,
  productionSourceMap: false,
  filenameHashing: false,

  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    config.devtool = process.env.NODE_ENV === 'development' ? 'inline-source-map' : false;
    config.module.rules
      .filter((rule) => rule.test.toString().indexOf('scss') !== -1)
      .forEach((rule) => {
        rule.oneOf.forEach((oneOfRule) => {
          oneOfRule.use.splice(oneOfRule.use.indexOf(require.resolve('sass-loader')), 0, {
            loader: require.resolve('css-unicode-loader'),
          });
        });
      });
    config.plugins.push(
      new WebpackExtensionManifestPlugin({
        config: {
          base: makeManifest(env.EXTENSION_TYPE),
        },
      })
    );

    config.output.filename = `[name].js`;
    config.output.chunkFilename = `[name].js`;
  },
});
