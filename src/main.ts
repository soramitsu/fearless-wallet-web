import { keyring } from '@polkadot/ui-keyring';
import Vue from 'vue';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Plugin } from 'vue-fragment';
import router from '@/router';
import i18n from '@/locales';
import store from '@/store';
import App from '@/App.vue';
import '@/styles';
import '@/plugins';
import '@/assets';

Vue.use(Plugin);

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

cryptoWaitReady().then((): void => {
  keyring.loadAll({ type: 'sr25519' });

  new Vue({
    store,
    router,
    i18n,
    render: (h) => h(App),
  }).$mount('#app');
});
