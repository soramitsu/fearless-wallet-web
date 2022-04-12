import Vue from 'vue';
import App from './App.vue';
import store from './store';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import keyring from '@polkadot/ui-keyring';
import AccountsStore from './storeChrome/Accounts';

import './plugins';
import './styles';
import router from './router';

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
