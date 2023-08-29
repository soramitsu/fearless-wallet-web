import { RouteConfig } from 'vue-router';
import store from '@/store';
import Welcome from '@/screens/welcome/Welcome.vue';
import Main from '@/screens/main/Main.vue';
import Asset from '@/screens/wallet&asset/asset/Asset.vue';
import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import { isOnboardingRequired } from '@/extension/messaging';

const Crowdloans = () => import('@/screens/crowdloans/Crowdloans.vue');
const Staking = () => import('@/screens/staking/Staking.vue');
const History = () => import('@/screens/history/History.vue');
const Accounts = () => import('@/screens/accounts/Accounts.vue');
const Nodes = () => import('@/screens/accounts/Nodes.vue');
const MobileConnect = () => import('@/screens/mobileConnect/MobileConnect.vue');
const Authorize = () => import('@/screens/extension-ui/authorize/Authorize.vue');
const AuthManagment = () => import('@/screens/extension-ui/AuthManagment.vue');
const ManageAuths = () => import('@/screens/extension-ui/ManageAuths.vue');
const UpdateAuths = () => import('@/screens/extension-ui/authorize/UpdateAuths.vue');

const Transaction = () => import('@/screens/extension-ui/signing/Transaction.vue');
const MetaRequest = () => import('@/screens/extension-ui/metadata/Metadata.vue');
const Export = () => import('@/screens/accounts/Export.vue');
const WalletConnectInit = () => import('@/screens/walletConnect/WalletConnectInit.vue');
const WalletConnectAuth = () => import('@/screens/walletConnect/WalletConnectAuth.vue');
const Onboarding = () => import('@/screens/onboarding/Onboarding.vue');

const AssetNetworks = () =>
  import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetNetworks.vue');
const AssetHistory = () => import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetHistory.vue');
const SoraCard = () => import(/* webpackChunkName: "sora" */ '@/screens/soraCard/SoraCardPage.vue');
const SoraSwap = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/SwapForm.vue');
const PolkaswapDisclaimer = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/Disclaimer.vue');
const Polkaswap = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/Polkaswap.vue');

const AddWallet = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/AddWallet.vue');
const AddFromGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/AddFromGoogle.vue');
const CreateGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/CreateGoogle.vue');

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
  ManageAuths = 'ManageAuths',
  UpdateAuths = 'UpdateAuths',
  MetaRequest = 'MetaRequest',
  Transaction = 'Transaction',
  CreateGoogle = 'CreateGoogle',
  AddFromGoogle = 'AddFromGoogle',
  PolkaswapDisclaimer = 'PolkaswapDisclaimer',
  SoraSwap = 'SoraSwap',
  SoraCard = 'SoraCard',
  NoFound = 'NoFound',
  AssetHistory = 'AssetHistory',
  AssetNetworks = 'AssetNetworks',
  WalletConnectInit = 'WalletConnectInit',
  WalletConnectSessionAuth = 'WalletConnectSessionAuth',
  WalletConnectSessionDetails = 'WalletConnectSessionDetails',
  WalletConnectSessionRequest = 'WalletConnectSessionRequest',
  Onboarding = 'Onboarding',
}

const haveSelectedWallet = () => {
  return store.getters.getSelectedWallet.address.length !== 0;
};

const haveAuthRequests = () => store.getters.authList.length;
const haveSignRequests = () => store.getters.signList.length;
const haveMetaRequests = () => store.getters.metaRequests.length;
const showSoraCard = () => store.getters.features?.fiat?.soraCard;

const routes: Array<RouteConfig> = [
  {
    path: '/welcome',
    name: Components.Welcome,
    component: Welcome,
  },
  {
    path: '/onboarding',
    name: Components.Onboarding,
    component: Onboarding,
  },
  {
    path: '/google/:access_token',
    name: Components.AddFromGoogle,
    component: AddFromGoogle,
  },
  {
    path: '/google-create/:access_token',
    name: Components.CreateGoogle,
    component: CreateGoogle,
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
    path: '/auth-management',
    component: AuthManagment,
    children: [
      {
        path: '/',
        name: Components.ManageAuths,
        component: ManageAuths,
      },
      {
        path: ':index',
        name: Components.UpdateAuths,
        component: UpdateAuths,
      },
    ],
  },
  {
    path: '/sora-card',
    name: Components.SoraCard,
    component: SoraCard,
    beforeEnter: (to, from, next) => {
      if (showSoraCard()) next();
      else next({ name: Components.Wallet });
    },
  },
  {
    path: '/sora-swap',
    name: Components.SoraSwap,
    component: SoraSwap,
  },
  {
    path: '/polkaswap-disclaimer',
    name: Components.PolkaswapDisclaimer,
    component: PolkaswapDisclaimer,
  },
  {
    path: '/fearless',
    component: Main,
    children: [
      {
        path: '/',
        redirect: { name: Components.Wallet },
      },
      {
        path: 'wallet/:access_token?',
        props: (route) => ({ query: route.query.wallet }),
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
        path: 'wallet-connect',
        name: Components.WalletConnectInit,
        component: WalletConnectInit,
      },
      {
        path: 'wc-authorize',
        name: Components.WalletConnectSessionAuth,
        component: WalletConnectAuth,
      },
      {
        path: 'wc-sign',
        name: Components.WalletConnectSessionRequest,
        component: WalletConnectInit,
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
        path: 'asset/:assetId',
        component: Asset,
        children: [
          {
            path: '/',
            name: Components.AssetNetworks,
            component: AssetNetworks,
            beforeEnter: (to, from, next) => {
              from.params.network = '';
              next();
            },
          },
          {
            path: ':selectedNetwork',
            name: Components.AssetHistory,
            component: AssetHistory,
          },
        ],
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
      if (!haveSelectedWallet()) next({ name: Components.Welcome });
      else next();
    },
  },
  {
    path: '*',
    component: Welcome,
    beforeEnter: async (to, from, next) => {
      const isRequired = await isOnboardingRequired();

      if (isRequired) next({ name: Components.Onboarding });
      else if (haveSelectedWallet()) next({ name: Components.Wallet });
      else next();
    },
  },
];

export default routes;
