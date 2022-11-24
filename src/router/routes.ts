import { RouteConfig } from 'vue-router';
import store from '@/store';
import BaseApi from '@/util/BaseApi';
import Welcome from '@/screens/welcome/Welcome.vue';
import Main from '@/screens/main/Main.vue';
import Asset from '@/screens/wallet&asset/asset/Asset.vue';
import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';

const AddWallet = () => import('@/screens/addWallet/AddWallet.vue');
const Crowdloans = () => import('@/screens/crowdloans/Crowdloans.vue');
const Staking = () => import('@/screens/staking/Staking.vue');
const History = () => import('@/screens/history/History.vue');
const Polkaswap = () => import('@/screens/polkaswap/Polkaswap.vue');
const Accounts = () => import('@/screens/accounts/Accounts.vue');
const Export = () => import('@/screens/accounts/Export.vue');
const Nodes = () => import('@/screens/accounts/Nodes.vue');
const MobileConnect = () => import('@/screens/mobileConnect/MobileConnect.vue');
const Authorize = () => import('@/screens/extension-ui/authorize/Authorize.vue');
const Transaction = () => import('@/screens/extension-ui/signing/Transaction.vue');
const MetaRequest = () => import('@/screens/extension-ui/metadata/Metadata.vue');

export enum Components {
  Welcome = 'Welcome',
  AddWallet = 'AddWallet',
  MobileConnect = 'MobileConnect',
  Main = 'Main',
  Wallet = 'Wallet',
  Crowdloans = 'Crowdloans',
  Polkaswap = 'Polkaswap',
  Staking = 'Staking',
  History = 'History',
  Asset = 'Asset',
  AccountsLayout = 'AccountsLayout',
  Accounts = 'Accounts',
  Nodes = 'Nodes',
  Export = 'Export',
  Authorize = 'Authorize',
  MetaRequest = 'MetaRequest',
  Transaction = 'Transaction',
}

const haveAccounts = () => BaseApi.getAccounts().length > 0 || BaseApi.getAddresses().length > 0;
const haveAuthRequests = () => store.getters.getAuthList.length;
const haveSignRequests = () => store.getters.getSignList.length;
const haveMetaRequests = () => store.getters.getMetaRequests.length;

const routes: Array<RouteConfig> = [
  {
    path: '/welcome/:access_token',
    name: Components.Welcome,
    component: Welcome,
  },
  {
    path: '/add-wallet/:type',
    name: Components.AddWallet,
    component: AddWallet,
  },
  {
    path: '/add-mobile-wallet',
    name: Components.MobileConnect,
    component: MobileConnect,
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
        path: 'wallet',
        name: Components.Wallet,
        component: Wallet,
        beforeEnter: (to, from, next) => {
          if (haveAuthRequests()) next({ name: Components.Authorize });
          else if (haveSignRequests()) next({ name: Components.Transaction });
          else if (haveMetaRequests()) next({ name: Components.MetaRequest });
          else next();
        },
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
        path: ':network/:assetId',
        name: Components.Asset,
        component: Asset,
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
        path: 'polkaswap',
        name: Components.Polkaswap,
        component: Polkaswap,
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
    redirect: () => {
      return { name: haveAccounts() ? Components.Wallet : Components.Welcome };
    },
  },
];

export default routes;
