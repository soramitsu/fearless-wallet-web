import Vue from 'vue';
import Vuex, { ModuleTree } from 'vuex';

const files = require.context('.', false, /\.ts$/);
const modules: ModuleTree<unknown> = {};

files.keys().forEach((key) => {
  if (key === './index.ts') return;
  modules[key.replace(/(\.\/|\.ts)/g, '')] = files(key).default;
});

Vue.use(Vuex);

const store = new Vuex.Store({
  modules,
  strict: process.env.NODE_ENV !== 'production',
});

export default store;
