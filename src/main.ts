import { keyring } from '@polkadot/ui-keyring';
import Vue from 'vue';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Plugin } from 'vue-fragment';
import { ethProvider } from './controllers/ethers/ethProvider';
import EthContract from './controllers/ethers/ethContract';

import router from '@/router';
import i18n from '@/locales';
import store from '@/store';
import App from '@/App.vue';
import '@/styles';
import '@/plugins';
import '@/assets';
import '@/components';

Vue.use(Plugin);

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';
const provider = ethProvider.provider;
const contract = new EthContract('0xdAC17F958D2ee523a2206206994597C13D831ec7', provider);
contract.getBalance('0x30Fe67eaE94E33F944bB7f468C6F6dE97f444122');
cryptoWaitReady().then((): void => {
  keyring.loadAll({ type: 'sr25519' });

  new Vue({
    store,
    router,
    i18n,
    render: (h) => h(App),
  }).$mount('#app');
});
