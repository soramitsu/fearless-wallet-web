const path = require('path');
const fs = require('fs');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const WebpackCopyPlugin = require('copy-webpack-plugin');
const { defineConfig } = require('@vue/cli-service');
const baseConfig = require('./vue.config.base');
const outputFolder = path.resolve('dist/extension');
const pages = {};

function getFileExtension(filename) {
  return /[.]/.exec(filename) ? /[^.]+$/.exec(filename)[0] : undefined;
}

function getEntryFile(entryPath) {
  return fs.readdirSync(entryPath);
}

const entries = getEntryFile(path.join(__dirname, `src/extension/entry`));

entries.forEach((name) => {
  const fileExtension = getFileExtension(name);
  const fileName = name.replace('.' + fileExtension, '');
  pages[fileName] = {
    entry: `src/extension/entry/${name}`,
    template: 'public/index.html',
    filename: `${fileName}.html`,
  };
});

module.exports = defineConfig({
  ...baseConfig,
  pages,
  outputDir: 'dist/extension',
  filenameHashing: false,
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    config.devtool = process.env.NODE_ENV === 'development' ? 'inline-source-map' : 'source-map';
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
      new WebpackCopyPlugin({
        patterns: [
          {
            from: path.resolve(`src/extension/manifest.${process.env.NODE_ENV}.json`),
            to: `${outputFolder}/manifest.json`,
          },
          {
            from: path.resolve(`public/`),
            to: `${outputFolder}/`,
          },
        ],
      })
    );

    config.output.filename = `[name].js`;
    config.output.chunkFilename = `[name].js`;
  },
});
