import Vue from 'vue';
import Vuex from 'vuex';
import networks from './networks';
import account from './accounts';
import auth from './auth';
import type Modules from './types';

const files = require.context('.', false, /\.ts$/);
export const modules: Modules = {
  networks,
  account,
  auth,
};

files.keys().forEach((key) => {
  const ignoredFiles = ['./index.ts', './types.ts', './helpers.ts'];

  if (ignoredFiles.includes(key)) return;

  modules[key.replace(/(\.\/|\.ts)/g, '')] = files(key).default;
});

Vue.use(Vuex);

const store = new Vuex.Store({
  modules,
  strict: false, // to ignore design system extended store errors. it should be set to `true` periodically
});

export default store;
