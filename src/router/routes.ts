import { RouteConfig } from 'vue-router';
import Welcome from '../screens/welcome/Welcome.vue';
import Wallet from '../screens/wallet/Wallet.vue';
import WelcomeBack from '../screens/welcomeBack/WelcomeBack.vue';
import AccountController from '../controllers/accountController';
import keyring from '@polkadot/ui-keyring';

export enum Components {
  Welcome = 'Welcome',
  Wallet = 'Wallet',
  WelcomeBack = 'WelcomeBack',
}

const accountController = new AccountController();
const haveAccounts = () => keyring.getAccounts().length > 0;
const isSavedPassword = () => accountController.isSavedPassword();
const isCorrectPasswordAge = () => accountController.isCorrectPasswordAge();
const redirectToWelcomeBack = () => isSavedPassword() && !isCorrectPasswordAge();

const routes: Array<RouteConfig> = [
  {
    path: '/welcome',
    name: Components.Welcome,
    component: Welcome,
    beforeEnter: (to, from, next) => {
      if (redirectToWelcomeBack()) next({ name: Components.WelcomeBack });
      else if (haveAccounts()) next({ name: Components.Wallet });
      else next();
    },
  },
  {
    path: '/wallet',
    name: Components.Wallet,
    component: Wallet,
    beforeEnter: (to, from, next) => {
      if (redirectToWelcomeBack()) next({ name: Components.WelcomeBack });
      else if (!haveAccounts()) next({ name: Components.Welcome });
      else next();
    },
  },
  {
    path: '/welcome-back',
    name: Components.WelcomeBack,
    component: WelcomeBack,
    beforeEnter: (to, from, next) => {
      if (!isSavedPassword()) next({ name: Components.Welcome });
      else if (isCorrectPasswordAge()) next({ name: Components.Wallet });
      else next();
    },
  },
  {
    path: '/*',
    redirect: () => (haveAccounts() ? { name: Components.Wallet } : { name: Components.Welcome }),
  },
];

export default routes;
