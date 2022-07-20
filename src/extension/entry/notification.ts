import Vue from 'vue';
import Notification from '@/extension/view/notification.vue';

Vue.config.productionTip = false;

new Vue({
  render: (h) => h(Notification),
}).$mount('#app');
