import Vue from 'vue';
import { Plugin } from 'vue-fragment';
import { register } from 'register-service-worker';
import router from '@/router';
import { i18n } from '@/locales';
import store from '@/store';
import App from '@/App.vue';
import '@/styles';
import '@/plugins';
import '@/assets';
import '@/components';

Vue.use(Plugin);

Vue.config.productionTip = false;
Vue.config.devtools = process.env.NODE_ENV === 'development';
register('/service-worker.js', {
  ready() {
    console.info(
      'App is being served from the cache by a service worker.\n' + 'For more details, visit https://goo.gl/AFskqB'
    );
  },
  registered() {
    console.info('Service worker has been registered.');
  },
  cached() {
    console.info('Content has been cached for offline use.');
  },
  updatefound() {
    console.info('New content is downloading.');
  },
  updated() {
    console.info('New content is available; please refresh.');
  },
  offline() {
    console.info('No internet connection found. App is running in offline mode.');
  },
  error(error) {
    console.error('Error during service worker registration:', error);
  },
});

// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker
//       .register('service-worker.js')
//       .then((registration) => {
//         console.info('SW registered: ', registration);
//       })
//       .catch((registrationError) => {
//         console.info('SW registration failed: ', registrationError);
//       });
//   });
// }

new Vue({
  store,
  router,
  i18n,
  render: (h) => h(App),
}).$mount('#app');
