import '@polkadot/extension-inject/crossenv';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '@/router';
import { i18n } from '@/locales';
import App from '@/App.vue';
import '@/styles';
import { registerPlugins } from '@/plugins';
import '@/assets';
import { registerComponents } from '@/components';

export async function mountApplication(): Promise<void> {
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.use(i18n);
  registerPlugins(app);
  registerComponents(app);
  app.config.performance = process.env.NODE_ENV === 'development';
  app.mount('#app');
  await router.isReady();
}
