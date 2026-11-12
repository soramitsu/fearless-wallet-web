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
import { startArrivalFeedback } from '@/feel/useArrivalFeedback';

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
  // Tokens arriving: the receive sound, the balance card's gold pulse and a toast (src/feel, brand kit v3). A feel
  // effect never stops the wallet from starting.
  try {
    startArrivalFeedback(app);
  } catch (error) {
    console.warn('Arrival feedback is unavailable', error);
  }
}
