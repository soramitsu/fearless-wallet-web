const path = require('path');
const fs = require('fs');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const { defineConfig } = require('@vue/cli-service');
const baseConfig = require('./vue.config.base');
const outputFolder = path.resolve('dist/extension');
const pages = {};

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
  chainWebpack: (config) => {
    config.plugin('define').tap((definitions) => {
      definitions[0]['process.env'].EXTENSION_PREFIX = JSON.stringify(process.env.EXTENSION_PREFIX);
      definitions[0]['process.env'].PORT_PREFIX = JSON.stringify(process.env.PORT_PREFIX);

      return definitions;
    });
    config.resolve.alias.set('@extension-base', path.resolve(__dirname, 'src/extension/background/extension-base/src'));
    config.plugin('copy').use(require('copy-webpack-plugin'), [
      {
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
      },
    ]);
  },
  configureWebpack: (config) => {
    config.plugins.push(new NodePolyfillPlugin());
    config.devtool = process.env.NODE_ENV === 'development' ? 'inline-source-map' : 'source-map';
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

function getFileExtension(filename) {
  return /[.]/.exec(filename) ? /[^.]+$/.exec(filename)[0] : undefined;
}

function getEntryFile(entryPath) {
  return fs.readdirSync(entryPath);
}
