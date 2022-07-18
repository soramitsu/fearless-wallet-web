import Vue from 'vue';
import Option from '@/view/options.vue';

Vue.config.productionTip = false;

new Vue({
  render: (h) => h(Option),
}).$mount('#app');
