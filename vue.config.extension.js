const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const { defineConfig } = require('@vue/cli-service');

const baseConfig = require('./vue.config.base');
const path = require('path');
const fs = require('fs');
const pages = {};

function getEntryFile(entryPath) {
  const files = fs.readdirSync(entryPath);
  return files;
}
const chromeName = getEntryFile(path.join(__dirname, `src/entry`));

function getFileExtension(filename) {
  return /[.]/.exec(filename) ? /[^.]+$/.exec(filename)[0] : undefined;
}

chromeName.forEach((name) => {
  const fileExtension = getFileExtension(name);
  const fileName = name.replace('.' + fileExtension, '');
  pages[fileName] = {
    entry: `src/entry/${name}`,
    template: 'public/index.html',
    filename: `${fileName}.html`,
  };
});

module.exports = defineConfig({
  ...baseConfig,
  pages,
  filenameHashing: false,
  chainWebpack: (config) => {
    config.plugin('copy').use(require('copy-webpack-plugin'), [
      {
        patterns: [
          {
            from: path.resolve(`src/manifest.${process.env.NODE_ENV}.json`),
            to: `${path.resolve('dist')}/manifest.json`,
          },
          {
            from: path.resolve(`public/`),
            to: `${path.resolve('dist')}/`,
          },
        ],
      },
    ]);
  },
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
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

    config.output.filename = `[name].js`;
    config.output.chunkFilename = `[name].js`;
  },
});
