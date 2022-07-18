import Vue from 'vue';
import keyring from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import Popup from '@/view/popup.vue';
import router from '@/router';
import store from '@/store';
import '@/styles';
import '@/plugins';

// import AccountsStore from './storeChrome/Accounts';

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

cryptoWaitReady().then((): void => {
  // load all the keyring data
  keyring.loadAll({
    // store: new AccountsStore(),
    type: 'sr25519',
  });

  new Vue({
    store,
    router,
    render: (h) => h(Popup),
  }).$mount('#app');
});
