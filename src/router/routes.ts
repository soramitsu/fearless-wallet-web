import Accounts from '@/screens/accounts/Accounts.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import Crowdloans from '@/screens/crowdloans/Crowdloans.vue';
import Dex from '@/screens/dex/Dex.vue';
import Export from '@/screens/accounts/Export.vue';
import History from '@/screens/history/History.vue';
import keyring from '@polkadot/ui-keyring';
import Main from '@/screens/main/Main.vue';
import Nodes from '@/screens/accounts/Nodes.vue';
import Staking from '@/screens/staking/Staking.vue';
import Token from '@/screens/wallet/token/Token.vue';
import Wallet from '@/screens/wallet/Wallet.vue';
import Welcome from '@/screens/welcome/Welcome.vue';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import { RouteConfig } from 'vue-router';

export enum Components {
  Welcome = 'Welcome',
  AddWallet = 'AddWallet',
  Main = 'Main',
  Wallet = 'Wallet',
  Crowdloans = 'Crowdloans',
  DEX = 'DEX',
  Staking = 'Staking',
  History = 'History',
  Token = 'Token',
  AccountsLayout = 'AccountsLayout',
  Accounts = 'Accounts',
  Nodes = 'Nodes',
  Export = 'Export',
}

const haveAccounts = () => keyring.getAccounts().length > 0;

const routes: Array<RouteConfig> = [
  {
    path: '/welcome',
    name: Components.Welcome,
    component: Welcome,
  },
  {
    path: '/add-wallet/:type',
    name: Components.AddWallet,
    component: AddWallet,
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
        path: 'accounts',
        name: Components.AccountsLayout,
        component: AccountsLayout,
        children: [
          {
            path: '/',
            name: Components.Accounts,
            component: Accounts,
          },
          {
            path: ':network',
            name: Components.Nodes,
            component: Nodes,
          },
          {
            path: ':network/export',
            name: Components.Export,
            component: Export,
          },
        ],
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
      if (!haveAccounts()) next({ name: Components.Welcome });
      else next();
    },
  },
  {
    path: '/*',
    redirect: () => (haveAccounts() ? { name: Components.Wallet } : { name: Components.Welcome }),
  },
];

export default routes;
