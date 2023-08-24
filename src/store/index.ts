import Vue from 'vue';
import Vuex, { Store } from 'vuex';
import networks from './networks';
import account from './accounts';
import extension from './extension';
import soraCard from './soraCard';
import type Modules from './types';

const files = require.context('.', false, /\.ts$/);

const modules: Modules = {
  networks,
  account,
  extension,
  soraCard,
};

files.keys().forEach((key) => {
  const ignoredFiles = ['./index.ts', './types.ts'];

  if (ignoredFiles.includes(key)) return;

  modules[key.replace(/(\.\/|\.ts)/g, '')] = files(key).default;
});

Vue.use(Vuex);

const store = new Store({
  modules,
  strict: false, // to ignore design system extended store errors. it should be set to `true` periodically
});

export default store;
export const useStore = () => store;

export * from './accounts/types';
export * from './networks/types';
export * from './soraCard/types';
