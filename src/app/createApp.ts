import { createApp } from 'vue';
import AppRoot from '@/App.vue';
import router from '@/router';
import { i18n } from '@/locales';
import registerPlugins from '@/plugins';
import registerGlobalComponents from '@/components';
import { installStores } from '@/stores/setup';

import '@/styles';
import '@/assets';

export const createFearlessApp = () => {
  const app = createApp(AppRoot);

  installStores(app);
  app.use(router);
  app.use(i18n);

  registerPlugins(app);
  registerGlobalComponents(app);

  Reflect.set(app.config, 'devtools', process.env.NODE_ENV === 'development');

  return app;
};

export default createFearlessApp;
