import '@polkadot/extension-inject/crossenv';
import { createPinia, PiniaVuePlugin } from 'pinia';
import Vue from 'vue';
import { Plugin } from 'vue-fragment';
import router from '@/router';
import { i18n } from '@/locales';
import store from '@/store';
import App from '@/App.vue';
import '@/styles';
import '@/plugins';
import '@/assets';
import '@/components';

Vue.use(Plugin);
Vue.use(PiniaVuePlugin); // TODO: remove for vue 3

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

export const pinia = createPinia();

new Vue({
  store,
  pinia,
  router,
  i18n,
  render: (h) => h(App),
}).$mount('#app');
