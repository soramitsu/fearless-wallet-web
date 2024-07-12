import '@polkadot/extension-inject/crossenv';

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

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

new Vue({
  store,
  router,
  i18n,
  render: (h) => h(App),
}).$mount('#app');
