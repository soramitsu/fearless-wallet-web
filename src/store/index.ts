import Vue from 'vue';
import Vuex from 'vuex';
import api from './api';
import Modules from './types';

const files = require.context('.', false, /\.ts$/);
const modules: Modules = {
  api,
};

files.keys().forEach((key) => {
  if (key === './index.ts' || key === './types.ts') return;

  modules[key.replace(/(\.\/|\.ts)/g, '')] = files(key).default;
});

Vue.use(Vuex);

const store = new Vuex.Store({
  modules,
  strict: false, // to ignore design system extended store errors. it should be set to `true` periodically
});

export default store;
