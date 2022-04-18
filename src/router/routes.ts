import { RouteConfig } from 'vue-router';
import WelcomePage from '../screens/welcomePage/WelcomePage.vue';
import MainPage from '../screens/mainPage/MainPage.vue';
import WelcomeBack from '../screens/welcomeBack/WelcomeBack.vue';
import AccountController from '../controllers/accountController';
import keyring from '@polkadot/ui-keyring';

export enum Components {
  WelcomePage = 'WelcomePage',
  MainPage = 'MainPage',
  WelcomeBack = 'WelcomeBack',
}

const accountController = new AccountController();
const haveAccounts = () => keyring.getAccounts().length > 0;
const isSavedPassword = () => accountController.isSavedPassword();
const isCorrectPasswordAge = () => accountController.isCorrectPasswordAge();
const redirectToWelcomeBack = () => isSavedPassword() && !isCorrectPasswordAge();

const routes: Array<RouteConfig> = [
  {
    path: '/welcome-page',
    name: Components.WelcomePage,
    component: WelcomePage,
    beforeEnter: (to, from, next) => {
      if (redirectToWelcomeBack()) next({ name: Components.WelcomeBack });
      else if (haveAccounts()) next({ name: Components.MainPage });
      else next();
    },
  },
  {
    path: '/main-page',
    name: Components.MainPage,
    component: MainPage,
    beforeEnter: (to, from, next) => {
      if (redirectToWelcomeBack()) next({ name: Components.WelcomeBack });
      else if (!haveAccounts()) next({ name: Components.WelcomePage });
      else next();
    },
  },
  {
    path: '/welcome-back',
    name: Components.WelcomeBack,
    component: WelcomeBack,
    beforeEnter: (to, from, next) => {
      if (!isSavedPassword()) next({ name: Components.WelcomePage });
      else if (isCorrectPasswordAge()) next({ name: Components.MainPage });
      else next();
    },
  },
  {
    path: '/*',
    redirect: () => (haveAccounts() ? { name: Components.MainPage } : { name: Components.WelcomePage }),
  },
];

export default routes;
