const requireAll = (requireContext: __WebpackModuleApi.RequireContext) => requireContext.keys().map(requireContext);

const icons = require.context('./', true, /\.svg$/);

requireAll(icons);
