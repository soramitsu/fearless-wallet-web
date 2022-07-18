import Vue from 'vue';
import Devtools from '@/view/devtools.vue';
chrome.devtools.panels.create('fearless-wallet', '', 'devtools.html');
Vue.config.productionTip = false;

new Vue({
  render: (h) => h(Devtools),
}).$mount('#app');
