import Vue from 'vue';
import App from '@/App.vue';
import router from '@/router';
import store from '@/store';
import '@/styles';
import '@/plugins';

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';

new Vue({
  store,
  router,
  render: (h) => h(App),
}).$mount('#app');
