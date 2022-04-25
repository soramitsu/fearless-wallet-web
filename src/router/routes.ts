import { RouteConfig } from 'vue-router';
import Welcome from '@/screens/welcome/Welcome.vue';
import Wallet from '@/screens/wallet/Wallet.vue';
import Crowdloans from '@/screens/crowdloans/Crowdloans.vue';
import Dex from '@/screens/dex/Dex.vue';
import Staking from '@/screens/staking/Staking.vue';
import History from '@/screens/history/History.vue';
import Token from '@/screens/wallet/token/Token.vue';
import Main from '@/screens/main/Main.vue';
import WelcomeBack from '@/screens/welcomeBack/WelcomeBack.vue';
import AccountController from '@/controllers/accountController';
import keyring from '@polkadot/ui-keyring';

export enum Components {
  Welcome = 'Welcome',
  WelcomeBack = 'WelcomeBack',
  Main = 'Main',
  Wallet = 'Wallet',
  Crowdloans = 'Crowdloans',
  DEX = 'DEX',
  Staking = 'Staking',
  History = 'History',
  Token = 'Token',
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
    path: '/main',
    name: Components.Main,
    component: Main,
    children: [
      {
        path: '',
        beforeEnter: (to, from, next) => {
          next({ name: Components.Wallet });
        },
      },
      {
        path: 'wallet',
        name: Components.Wallet,
        component: Wallet,
      },
      {
        path: ':network/:token',
        name: Components.Token,
        component: Token,
      },
      {
        path: 'crowdloans',
        name: Components.Crowdloans,
        component: Crowdloans,
      },
      {
        path: 'staking',
        name: Components.Staking,
        component: Staking,
      },
      {
        path: 'dex',
        name: Components.DEX,
        component: Dex,
      },
      {
        path: 'history',
        name: Components.History,
        component: History,
      },
    ],
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
