import { RouteConfig } from 'vue-router';
import BaseApi from '@/util/BaseApi';
import Dex from '@/screens/dex/Dex.vue';
import Export from '@/screens/accounts/Export.vue';
import History from '@/screens/history/History.vue';
import Nodes from '@/screens/accounts/Nodes.vue';
import Staking from '@/screens/staking/Staking.vue';
import Token from '@/screens/wallet&token/token/Token.vue';
import Wallet from '@/screens/wallet&token/wallet/Wallet.vue';
import Welcome from '@/screens/welcome/Welcome.vue';
import AddWallet from '@/screens/addWallet/AddWallet.vue';
import ManageAuths from '@/screens/authorize/ManageAuths.vue';
import Accounts from '@/screens/accounts/Accounts.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import Main from '@/screens/main/Main.vue';
import Crowdloans from '@/screens/crowdloans/Crowdloans.vue';
import Authorize from '@/screens/authorize/Authorize.vue';
import MetaRequest from '@/screens/metadata/Metadata.vue';
import Transaction from '@/screens/signing/Transaction.vue';

import store from '@/store';

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
  ManageAuths = 'ManageAuths',
  Authorize = 'Authorize',
  MetaRequest = 'MetaRequest',
  Transaction = 'Transaction',
}

const haveAccounts = () => BaseApi.getAccounts().length > 0 || BaseApi.getAddresses().length > 0;
const haveAuthRequests = () => store.getters.getAuthList.length;
const haveSignRequests = () => store.getters.getSignList.length;
const haveMetaRequests = () => store.getters.getMetaList.length;

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
    path: '/authorize',
    name: Components.Authorize,
    component: Authorize,
  },
  {
    path: '/meta',
    name: Components.MetaRequest,
    component: MetaRequest,
  },
  {
    path: '/transaction',
    name: Components.Transaction,
    component: Transaction,
  },
  {
    path: '/main',
    component: Main,
    children: [
      {
        path: '',
        beforeEnter: (to, from, next) => {
          next({ name: Components.Wallet });
        },
      },
      {
        path: 'manageauths',
        name: Components.ManageAuths,
        component: ManageAuths,
      },
      {
        path: 'wallet',
        name: Components.Wallet,
        component: Wallet,
      },
      {
        path: 'accounts',
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
        path: ':network/:tokenId',
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
    beforeEnter: (to, from, next) => {
      if (haveAuthRequests()) next({ name: Components.Authorize });
      else if (haveSignRequests()) next({ name: Components.Transaction });
      else if (haveMetaRequests()) next({ name: Components.MetaRequest });
      else next();
    },
    redirect: () => {
      return { name: haveAccounts() ? Components.Wallet : Components.Welcome };
    },
  },
];

export default routes;
