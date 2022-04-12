import { RouteConfig } from 'vue-router';
import WelcomePage from '../screens/welcomePage/WelcomePage.vue';
import MainPage from '../screens/mainPage/MainPage.vue';
import keyring from '@polkadot/ui-keyring';

export enum Components {
  WelcomePage = 'WelcomePage',
  MainPage = 'MainPage',
}

const haveAccounts = () => keyring.getAccounts().length > 0;

const routes: Array<RouteConfig> = [
  {
    path: '/welcome-page',
    name: Components.WelcomePage,
    component: WelcomePage,
    beforeEnter: (to, from, next) => {
      if (haveAccounts()) next({ name: Components.MainPage });
      else next();
    },
  },
  {
    path: '/main-page',
    name: Components.MainPage,
    component: MainPage,
    beforeEnter: (to, from, next) => {
      if (!haveAccounts()) next({ name: Components.WelcomePage });
      else next();
    },
  },
  {
    path: '/*',
    redirect: () => (haveAccounts() ? { name: Components.MainPage } : { name: Components.WelcomePage }),
  },
];

export default routes;
