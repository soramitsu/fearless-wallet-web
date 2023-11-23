import { type RouteConfig } from 'vue-router';
import store, { type NetworkParams } from '@/store';
import Welcome from '@/screens/welcome/Welcome.vue';
import Main from '@/screens/main/Main.vue';
import Asset from '@/screens/wallet&asset/asset/Asset.vue';
import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import { type NetworkName } from '@/interfaces';
import WcAuths from '@/screens/extension-ui/WcAuths.vue';
import SubstrateAuths from '@/screens/extension-ui/SubstrateAuths.vue';

const Crowdloans = () => import('@/screens/crowdloans/Crowdloans.vue');
const Accounts = () => import('@/screens/accounts/Accounts.vue');
const Nodes = () => import('@/screens/accounts/Nodes.vue');
const MobileWalletAuth = () => import('@/screens/mobile-wallet/MobileWalletAuth.vue');
const Authorize = () => import('@/screens/extension-ui/authorize/Authorize.vue');
const AuthManagment = () => import('@/screens/extension-ui/AuthManagment.vue');
const ManageAuths = () => import('@/screens/extension-ui/ManageAuths.vue');
const UpdateAuths = () => import('@/screens/extension-ui/authorize/UpdateAuths.vue');

const Transaction = () => import('@/screens/extension-ui/signing/Transaction.vue');
const MetaRequest = () => import('@/screens/extension-ui/metadata/Metadata.vue');
const Export = () => import('@/screens/accounts/Export.vue');
const WalletConnectAuthDetails = () => import('@/screens/walletConnect/WalletConnectAuthDetails.vue');
const WalletConnectInitAuth = () => import('@/screens/walletConnect/WalletConnectInitAuth.vue');
const WalletConnectAuthConfirmation = () => import('@/screens/walletConnect/WalletConnectAuthConfirmation.vue');
const WalletConnectSignConfirmation = () => import('@/screens/walletConnect/WalletConnectSignConfirmation.vue');
const WalletConnectNotSupportedRequest = () => import('@/screens/walletConnect/WalletConnectNotSupportedRequest.vue');
const Onboarding = () => import('@/screens/onboarding/Onboarding.vue');

const AssetNetworks = () =>
  import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetNetworks.vue');
const AssetHistory = () => import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetHistory.vue');

const SoraCard = () => import(/* webpackChunkName: "sora" */ '@/screens/soraCard/SoraCardPage.vue');
const SoraSwap = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/SwapForm.vue');
const PolkaswapDisclaimer = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/Disclaimer.vue');

const AddWallet = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/AddWallet.vue');
const AddFromGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/AddFromGoogle.vue');
const CreateGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/CreateGoogle.vue');

const MyStake = () => import(/* webpackChunkName: "staking */ '@/screens/staking/myStake/MyStake.vue');
const Staking = () => import(/* webpackChunkName: "staking */ '@/screens/staking/StakingPage.vue');

export enum Components {
  Welcome = 'Welcome',
  AddWallet = 'AddWallet',
  MobileWalletAuth = 'MobileWalletAuth',
  Main = 'Main',
  Wallet = 'Wallet',
  Crowdloans = 'Crowdloans',
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
  Polkaswap = 'Polkaswap',
  PolkaswapDisclaimer = 'PolkaswapDisclaimer',
  SoraSwap = 'SoraSwap',
  SoraCard = 'SoraCard',
  Staking = 'Staking',
  MyStake = 'MyStake',
  NoFound = 'NoFound',
  AssetHistory = 'AssetHistory',
  AssetNetworks = 'AssetNetworks',
  WalletConnectInitAuth = 'WalletConnectInitAuth',
  WalletConnectAuthConfirmation = 'WalletConnectAuthConfirmation',
  WalletConnectAuthDetails = 'WalletConnectAuthDetails',
  WalletConnectSessionDetails = 'WalletConnectSessionDetails',
  WalletConnectSessionRequest = 'WalletConnectSessionRequest',
  WalletConnectSignConfirmation = 'WalletConnectSignConfirmation',
  WalletConnectNotSupportedRequest = 'WalletConnectNotSupportedRequest',
  SubstrateAuths = 'SubstrateAuths',
  WcAuths = 'WcAuths',
  Onboarding = 'Onboarding',
}

const haveSelectedWallet = () => {
  return store.getters.selectedWallet.address.length !== 0;
};

const haveAuthRequests = (): number => store.getters.authList.length;
const haveSignRequests = (): number => store.getters.signList.length;
const haveMetaRequests = (): number => store.getters.metaRequests.length;
const showSoraCard = (): boolean => store.getters.features?.fiat?.soraCard;
const getStakingNetwork = async (network: NetworkName): Promise<NetworkParams> =>
  await new Promise((res) => setTimeout(() => res(store.getters.getStakingNetwork(network)), 100));

const routes: Array<RouteConfig> = [
  {
    path: '/welcome',
    name: Components.Welcome,
    component: Welcome,
    meta: {
      title: 'welcome',
    },
  },
  {
    path: '/onboarding',
    name: Components.Onboarding,
    component: Onboarding,
    meta: {
      title: 'onboarding',
    },
  },
  {
    path: '/google/:access_token',
    name: Components.AddFromGoogle,
    component: AddFromGoogle,
    meta: {
      title: 'google',
    },
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
    meta: {
      title: 'addWallet',
    },
  },
  {
    path: '/add-mobile-wallet',
    name: Components.MobileWalletAuth,
    component: MobileWalletAuth,
    meta: {
      title: 'addMobileWallet',
    },
  },
  {
    path: '/authorize',
    name: Components.Authorize,
    component: Authorize,
    meta: {
      title: 'authorize',
    },
  },
  {
    path: '/wc-authorize',
    name: Components.WalletConnectAuthConfirmation,
    component: WalletConnectAuthConfirmation,
  },
  {
    path: '/wc-transaction',
    name: Components.WalletConnectSignConfirmation,
    component: WalletConnectSignConfirmation,
  },
  {
    path: '/wc-not-supported',
    name: Components.WalletConnectNotSupportedRequest,
    component: WalletConnectNotSupportedRequest,
  },
  {
    path: '/wallet-connect',
    name: Components.WalletConnectInitAuth,
    component: WalletConnectInitAuth,
  },
  {
    path: '/wc-sign',
    name: Components.WalletConnectSessionRequest,
    component: WalletConnectInitAuth,
  },
  {
    path: '/meta',
    name: Components.MetaRequest,
    component: MetaRequest,
    meta: {
      title: 'meta',
    },
  },
  {
    path: '/transaction',
    name: Components.Transaction,
    component: Transaction,
    meta: {
      title: 'transaction',
    },
  },
  {
    path: '/auth-management',
    component: AuthManagment,
    children: [
      {
        path: '/',
        name: Components.ManageAuths,
        component: ManageAuths,
        redirect: { name: Components.SubstrateAuths },
        children: [
          {
            path: '/dotsama',
            name: Components.SubstrateAuths,
            component: SubstrateAuths,
          },
          {
            path: '/wc',
            name: Components.WcAuths,
            component: WcAuths,
          },
        ],
      },
      {
        path: '/dotsama-details/:id',
        name: Components.UpdateAuths,
        component: UpdateAuths,
      },
      {
        path: 'wc-details/:topic',
        name: Components.WalletConnectAuthDetails,
        component: WalletConnectAuthDetails,
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
    meta: {
      title: 'soraCard',
    },
  },
  {
    path: '/sora-swap',
    name: Components.SoraSwap,
    component: SoraSwap,
    meta: {
      title: 'soraSwap',
    },
  },
  {
    path: '/polkaswap-disclaimer',
    name: Components.PolkaswapDisclaimer,
    component: PolkaswapDisclaimer,
    meta: {
      title: 'polkaswapDisclaimer',
    },
  },
  {
    path: '/my-stake/:network',
    name: Components.MyStake,
    component: MyStake,
    beforeEnter: async (to, from, next) => {
      const network = to.params.network;
      const stakingParams = await getStakingNetwork(network);

      if (stakingParams.totalStake === '0') next({ name: Components.Staking });
      else next();
    },
    meta: {
      title: 'myStake',
    },
  },
  {
    path: '/fearless',
    component: Main,
    children: [
      {
        path: '/',
        redirect: { name: Components.Wallet },
        meta: {
          title: 'wallet',
        },
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
        meta: {
          title: 'wallet',
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
            meta: {
              title: 'accounts',
            },
          },
          {
            path: ':network',
            name: Components.Nodes,
            component: Nodes,
            meta: {
              title: 'nodes',
            },
          },
          {
            path: ':network/export',
            name: Components.Export,
            component: Export,
            meta: {
              title: 'export',
            },
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
        meta: {
          title: 'crowdloans',
        },
      },
      {
        path: 'staking',
        name: Components.Staking,
        component: Staking,
        meta: {
          title: 'staking',
        },
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
    beforeEnter: (to, from, next) => {
      if (haveSelectedWallet()) next({ name: Components.Wallet });
      else next();
    },
  },
];

export default routes;
