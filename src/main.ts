import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '@/router';
import { i18n } from '@/locales';
import App from '@/App.vue';
import '@/styles';
import { registerPlugins } from '@/plugins';
import '@/assets';
import { registerComponents } from '@/components';
import { IS_EXTENSION } from '@/consts/global';

if ('serviceWorker' in navigator && !IS_EXTENSION) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('service-worker.js')
      .then((registration) => console.info('SW registered: ', registration))
      .catch((registrationError) => console.info('SW registration failed: ', registrationError));
  });
}

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);
app.use(i18n);
registerPlugins(app);
registerComponents(app);
app.config.performance = process.env.NODE_ENV === 'development';
app.mount('#app');
