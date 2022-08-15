import App from '@/App.vue';
import keyring from '@polkadot/ui-keyring';
import router from '@/router';
import store from '@/store';
import Vue from 'vue';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import '@/styles';
import '@/plugins';

// import AccountsStore from './storeChrome/Accounts';

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

cryptoWaitReady().then((): void => {
  console.log('crypto initialized');

  // load all the keyring data
  keyring.loadAll({
    // store: new AccountsStore(),
    type: 'sr25519',
  });

  console.log('initialization completed');

  new Vue({
    store,
    router,
    render: (h) => h(App),
  }).$mount('#app');
});
