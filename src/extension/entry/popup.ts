import Vue from 'vue';
import Popup from '@/extension/view/popup.vue';
import router from '@/router';
import store from '@/store';
import '@/styles';
import '@/plugins';

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

new Vue({
  store,
  router,
  render: (h) => h(Popup),
}).$mount('#app');
