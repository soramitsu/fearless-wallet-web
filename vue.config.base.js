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
    },
  },
  productionSourceMap: false,
  runtimeCompiler: true,
  chainWebpack: (config) => {
    config.plugin('define').tap((definitions) => {
      definitions[0]['process.env'].EXTENSION_PREFIX = JSON.stringify(process.env.EXTENSION_PREFIX);
      definitions[0]['process.env'].PORT_PREFIX = JSON.stringify(process.env.PORT_PREFIX);

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
  },
};
