import Vue from 'vue';
import Vuex from 'vuex';
import networks from './networks';
import account from './accounts';
import auth from './auth';
import sign from './sign';
import meta from './metadata';
import beacon from './beacon';
import type Modules from './types';

const files = require.context('.', false, /\.ts$/);

const modules: Modules = {
  networks,
  account,
  auth,
  meta,
  beacon,
  sign,
};

files.keys().forEach((key) => {
  const ignoredFiles = ['./index.ts', './types.ts'];

  if (ignoredFiles.includes(key)) return;

  modules[key.replace(/(\.\/|\.ts)/g, '')] = files(key).default;
});

Vue.use(Vuex);

const store = new Vuex.Store({
  modules,
  strict: false, // to ignore design system extended store errors. it should be set to `true` periodically
});

export default store;
