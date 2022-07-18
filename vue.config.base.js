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
};
