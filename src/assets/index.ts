import Vue from 'vue';
import Icon from '@/components/Icon.vue'; // svg component

Vue.component('Icon', Icon);

const requireAll = (requireContext: __WebpackModuleApi.RequireContext) => requireContext.keys().map(requireContext);

const icons = require.context('./', true, /\.svg$/);

requireAll(icons);
