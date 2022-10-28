import Vue from 'vue';
import SvgIcon from '@/components/SvgIcon.vue'; // svg component

Vue.component('SvgIcon', SvgIcon);

const requireAll = (requireContext: __WebpackModuleApi.RequireContext) => requireContext.keys().map(requireContext);

const icons = require.context('./', true, /\.svg$/);

requireAll(icons);
