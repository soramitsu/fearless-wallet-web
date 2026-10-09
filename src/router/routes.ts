import { type RouteRecordRaw } from 'vue-router';
import { ADD_WALLET_PATH, PASSWORD_SETUP_PATH } from './accountFlowPaths';
import { getStakingNetwork, haveAuthRequests, haveMetaRequests, hasSelectedWallet, haveSignRequests } from './helpers';
import type { NetworkName } from '@/interfaces';
import { keyringIsLocked } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { useExtensionStore } from '@/stores/extension';
import { useStakingStore } from '@/stores/staking';
import Unlock from '@/screens/welcome/Unlock.vue';
import { initialAccountsReady } from '@/bootstrap/accountsReady';
import Welcome from '@/screens/welcome/Welcome.vue';
import Main from '@/screens/main/Main.vue';
import Asset from '@/screens/wallet&asset/asset/Asset.vue';
import Wallet from '@/screens/wallet&asset/wallet/Wallet.vue';
import AccountsLayout from '@/screens/accounts/AccountsLayout.vue';
import DAppsAuths from '@/screens/extension-ui/DAppsAuths.vue';
import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';

const ResetWallet = () => import('@/screens/welcome/ResetWallet.vue');
const ChangePassword = () => import('@/screens/welcome/ChangePassword.vue');
const WcAuths = () => import('@/screens/extension-ui/WcAuths.vue');

const NftDetails = () => import('@/screens/wallet&asset/nft/NftDetails.vue');
const NftCollection = () => import('@/screens/wallet&asset/nft/NftCollection.vue');
const NftCollectionList = () => import('@/screens/wallet&asset/nft/NftCollectionList.vue');
const NftSendForm = () => import('@/screens/wallet&asset/nft/NftSendForm.vue');

const AccountSetting = () => import('@/screens/accounts/AccountSetting.vue');
const ChainAccounts = () => import('@/screens/accounts/Accounts.vue');
const Export = () => import('@/screens/accounts/Export.vue');
const Nodes = () => import('@/screens/accounts/Nodes.vue');
const MobileWalletAuth = () => import('@/screens/mobile-wallet/MobileWalletAuth.vue');
const Authorize = () => import('@/screens/extension-ui/authorize/Authorize.vue');
const AuthManagement = () => import('@/screens/extension-ui/AuthManagement.vue');
const ManageAuths = () => import('@/screens/extension-ui/ManageAuths.vue');
const DAppDetails = () => import('@/screens/extension-ui/DAppDetails.vue');

const Transaction = () => import('@/screens/extension-ui/signing/Transaction.vue');
const MetaRequest = () => import('@/screens/extension-ui/metadata/Metadata.vue');
const WalletConnectAuthDetails = () => import('@/screens/walletConnect/WalletConnectAuthDetails.vue');
const WalletConnectInitAuth = () => import('@/screens/walletConnect/WalletConnectInitAuth.vue');
const WalletConnectAuthConfirmation = () => import('@/screens/walletConnect/WalletConnectAuthConfirmation.vue');
const WalletConnectSignConfirmation = () => import('@/screens/walletConnect/WalletConnectSignConfirmation.vue');
const WalletConnectNotSupportedRequest = () => import('@/screens/walletConnect/WalletConnectNotSupportedRequest.vue');
const Onboarding = () => import('@/screens/onboarding/Onboarding.vue');

const SendForm = () => import('@/screens/wallet&asset/SendForm.vue');
const ReceiveForm = () => import('@/screens/wallet&asset/ReceiveForm.vue');
const CrossChainForm = () => import('@/screens/wallet&asset/CrossChainForm.vue');

const AssetNetworks = () =>
  import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetNetworks.vue');
const AssetHistory = () => import(/* webpackChunkName: "asset-page" */ '@/screens/wallet&asset/asset/AssetHistory.vue');

const SoraSwap = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/SwapForm.vue');
const PolkaswapDisclaimer = () => import(/* webpackChunkName: "sora" */ '@/screens/polkaswap/swap/Disclaimer.vue');

const AddWallet = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/AddWallet.vue');
const AddFromGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/AddFromGoogle.vue');
const CreateGoogle = () => import(/* webpackChunkName: "add-wallet" */ '@/screens/addWallet/google/CreateGoogle.vue');

const MyStake = () => import(/* webpackChunkName: "staking */ '@/screens/staking/myStake/MyStake.vue');
const Staking = () => import(/* webpackChunkName: "staking */ '@/screens/staking/StakingPage.vue');

const Pools = () => import(/* webpackChunkName: "pools */ '@/screens/pools/PoolsPage.vue');
const PoolDetails = () => import(/* webpackChunkName: "pools */ '@/screens/pools/PoolDetails.vue');
const DeFi = () => import('@/screens/defi/DeFiHub.vue');
const CrossChain = () => import('@/screens/cross-chain/CrossChainRoot.vue');
const Settings = () => import('@/screens/settings/SettingsPage.vue');
const NetworksAssetsSettings = () => import('@/screens/settings/NetworksAssetsSettings.vue');
const IrohaConnect = () => import('@/screens/irohaConnect/IrohaConnectPage.vue');
const Farming = () => import('@/screens/defi/FarmingPage.vue');
const Polkamarkt = () => import('@/screens/defi/polkamarkt/PolkamarktPage.vue');

const MigrationDescription = (/* webpackChunkName: "migration */) =>
  import('@/screens/addWallet/keyringMigration/MigrationDescription.vue');

const MigrationAccounts = (/* webpackChunkName: "migration */) =>
  import('@/screens/addWallet/keyringMigration/MigrationAccounts.vue');

const UniversalWalletMigration = (/* webpackChunkName: "migration */) =>
  import('@/screens/addWallet/universalWalletMigration/UniversalWalletMigration.vue');

export enum Components {
  MigrationDescription = 'MigrationDescription',
  MigrationAccounts = 'MigrationAccounts',
  UniversalWalletMigration = 'UniversalWalletMigration',
  Unlock = 'Unlock',
  ResetWallet = 'ResetWallet',
  ChangePassword = 'ChangePassword',
  Welcome = 'Welcome',
  AddWallet = 'AddWallet',
  MobileWalletAuth = 'MobileWalletAuth',
  Main = 'Main',
  Wallet = 'Wallet',
  Defi = 'Defi',
  Asset = 'Asset',
  AccountsLayout = 'AccountsLayout',
  AccountSetting = 'AccountSetting',
  ChainAccounts = 'ChainAccounts',
  Nodes = 'Nodes',
  Export = 'Export',
  Authorize = 'Authorize',
  ManageAuths = 'ManageAuths',
  DAppDetails = 'DAppDetails',
  MetaRequest = 'MetaRequest',
  Transaction = 'Transaction',
  CreateGoogle = 'CreateGoogle',
  AddFromGoogle = 'AddFromGoogle',
  Polkaswap = 'Polkaswap',
  Polkamarkt = 'Polkamarkt',
  PolkaswapDisclaimer = 'PolkaswapDisclaimer',
  SoraSwap = 'SoraSwap',
  SendForm = 'SendForm',
  ReceiveForm = 'ReceiveForm',
  CrossChainForm = 'CrossChainForm',
  CrossChain = 'CrossChain',
  Staking = 'Staking',
  MyStake = 'MyStake',
  Pools = 'Pools',
  PoolDetails = 'PoolDetails',
  Farming = 'Farming',
  Settings = 'Settings',
  SettingsNetworksAssets = 'SettingsNetworksAssets',
  SettingsChangePassword = 'SettingsChangePassword',
  IrohaConnect = 'IrohaConnect',
  AssetHistory = 'AssetHistory',
  AssetNetworks = 'AssetNetworks',
  WalletConnectInitAuth = 'WalletConnectInitAuth',
  WalletConnectAuthConfirmation = 'WalletConnectAuthConfirmation',
  WalletConnectAuthDetails = 'WalletConnectAuthDetails',
  WalletConnectSessionDetails = 'WalletConnectSessionDetails',
  WalletConnectSessionRequest = 'WalletConnectSessionRequest',
  WalletConnectSignConfirmation = 'WalletConnectSignConfirmation',
  WalletConnectNotSupportedRequest = 'WalletConnectNotSupportedRequest',
  DAppsAuths = 'DAppsAuths',
  WcAuths = 'WcAuths',
  Onboarding = 'Onboarding',
  Currencies = 'Currencies',
  Nfts = 'Nfts',
  NftDetails = 'NftDetails',
  NftCollection = 'NftCollection',
  NftSendForm = 'NftSendForm',
}

const routes: Array<RouteRecordRaw> = [
  {
    path: '/migration-description',
    name: Components.MigrationDescription,
    component: MigrationDescription,
    meta: {
      title: 'migration',
    },
  },
  {
    path: '/migration-accounts',
    name: Components.MigrationAccounts,
    component: MigrationAccounts,
    meta: {
      title: 'migration',
    },
  },
  {
    path: '/universal-wallet-migration',
    name: Components.UniversalWalletMigration,
    component: UniversalWalletMigration,
    meta: {
      title: 'migration',
    },
  },

  {
    path: PASSWORD_SETUP_PATH,
    name: Components.ChangePassword,
    component: ChangePassword,
    meta: {
      title: 'changePassword',
    },
  },
  {
    path: '/unlock',
    name: Components.Unlock,
    component: Unlock,
    meta: {
      title: 'unlock',
    },
  },
  {
    path: '/reset',
    name: Components.ResetWallet,
    component: ResetWallet,
    meta: {
      title: 'reset',
    },
  },
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
    path: ADD_WALLET_PATH,
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
    redirect: { name: Components.WalletConnectInitAuth },
  },
  {
    path: '/wc-sign',
    name: Components.WalletConnectSessionRequest,
    component: WalletConnectInitAuth,
  },
  {
    path: '/collection/:contract',
    redirect: { name: Components.Nfts },
  },
  {
    path: '/collection/:contract/:id',
    redirect: { name: Components.Nfts },
  },
  {
    path: '/send-nft/:contract/:id',
    redirect: { name: Components.Nfts },
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
    beforeEnter: (to, from, next) => {
      const extensionStore = useExtensionStore();

      if (haveSignRequests(extensionStore)) next();
      else next({ name: Components.Wallet });
    },
  },
  {
    path: '/send/:assetId/:network',
    redirect: (to) => ({ name: Components.SendForm, params: to.params, query: to.query }),
  },
  {
    path: '/receive/:assetId/:network',
    redirect: (to) => ({ name: Components.ReceiveForm, params: to.params, query: to.query }),
  },
  {
    path: '/cross-chain/:assetId/:network',
    redirect: (to) => ({ name: Components.CrossChainForm, params: to.params }),
  },
  {
    path: '/currencies/:access_token?',
    redirect: (to) => ({ name: Components.Currencies, params: to.params, query: to.query }),
  },
  {
    path: '/nft-collections/:access_token?',
    redirect: (to) => ({ name: Components.Nfts, params: to.params, query: to.query }),
  },
  {
    path: '/auth-management',
    redirect: { name: Components.DAppsAuths, params: { type: 'substrate' } },
  },
  {
    path: '/dapps/:type',
    redirect: (to) => ({ name: Components.DAppsAuths, params: to.params, query: to.query }),
  },
  {
    path: '/wc',
    redirect: { name: Components.WcAuths },
  },
  {
    path: '/dapp-details/:type/:id',
    redirect: (to) => ({ name: Components.DAppDetails, params: to.params, query: to.query }),
  },
  {
    path: '/auth-management/wc-details/:topic',
    redirect: (to) => ({ name: Components.WalletConnectAuthDetails, params: to.params, query: to.query }),
  },
  {
    path: '/sora-swap',
    name: Components.SoraSwap,
    redirect: { name: Components.Polkaswap },
  },
  {
    path: '/pools',
    redirect: { name: Components.Pools },
  },
  {
    path: '/pool-details/:poolName',
    redirect: (to) => ({ name: Components.PoolDetails, params: to.params }),
  },
  {
    path: '/polkaswap-disclaimer',
    redirect: { name: Components.PolkaswapDisclaimer },
  },
  {
    path: '/my-stake/:network',
    redirect: (to) => ({ name: Components.MyStake, params: to.params, query: to.query }),
  },
  {
    path: '/fearless',
    component: Main,
    children: [
      {
        path: '',
        redirect: { name: Components.Wallet },
        meta: {
          title: 'wallet',
        },
      },
      {
        path: 'portfolio/:access_token?',
        alias: 'wallet/:access_token?',
        props: (route) => ({ query: route.query.wallet }),
        name: Components.Wallet,
        component: Wallet,
        redirect: { name: Components.Currencies },
        beforeEnter: (to, from, next) => {
          const extensionStore = useExtensionStore();

          if (haveAuthRequests(extensionStore)) next({ name: Components.Authorize });
          else if (haveSignRequests(extensionStore)) next({ name: Components.Transaction });
          else if (haveMetaRequests(extensionStore)) next({ name: Components.MetaRequest });
          else next();
        },
        meta: {
          title: 'wallet',
          primaryNavigation: 'portfolio',
        },
        children: [
          {
            path: 'tokens',
            name: Components.Currencies,
            component: Currencies,
            meta: {
              title: 'wallet',
              primaryNavigation: 'portfolio',
            },
          },
          {
            path: 'nfts',
            name: Components.Nfts,
            component: NftCollectionList,
            meta: {
              title: 'wallet',
              primaryNavigation: 'portfolio',
            },
          },
        ],
      },
      {
        path: 'portfolio/nfts/:chainId/collection/:contract',
        name: Components.NftCollection,
        component: NftCollection,
        meta: { title: 'wallet', primaryNavigation: 'portfolio' },
      },
      {
        path: 'portfolio/nfts/:chainId/collection/:contract/:id',
        name: Components.NftDetails,
        component: NftDetails,
        meta: { title: 'wallet', primaryNavigation: 'portfolio' },
      },
      {
        path: 'portfolio/nfts/:chainId/send/:contract/:id',
        name: Components.NftSendForm,
        component: NftSendForm,
        meta: { title: 'wallet', primaryNavigation: 'portfolio' },
      },
      {
        path: 'portfolio/nfts/collection/:contract/:id?',
        redirect: { name: Components.Nfts },
      },
      {
        path: 'portfolio/nfts/send/:contract/:id',
        redirect: { name: Components.Nfts },
      },
      {
        path: 'portfolio/send/:assetId/:network',
        name: Components.SendForm,
        component: SendForm,
        meta: { title: 'send', primaryNavigation: 'portfolio' },
      },
      {
        path: 'portfolio/receive/:assetId/:network',
        name: Components.ReceiveForm,
        component: ReceiveForm,
        meta: { title: 'receive', primaryNavigation: 'portfolio' },
      },
      {
        path: 'asset/:assetId',
        component: Asset,
        meta: {
          primaryNavigation: 'portfolio',
        },
        children: [
          {
            path: '',
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
        path: 'defi',
        name: Components.Defi,
        component: DeFi,
        meta: { title: 'defi', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/staking',
        name: Components.Staking,
        component: Staking,
        meta: { title: 'staking', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/staking/:network',
        name: Components.MyStake,
        component: MyStake,
        beforeEnter: async (to, from, next) => {
          const network = (Array.isArray(to.params.network) ? to.params.network[0] : to.params.network) as NetworkName;
          const stakingStore = useStakingStore();
          const stakingParams = await getStakingNetwork(stakingStore, network);

          if (stakingParams.totalStake === '0') next({ name: Components.Staking });
          else next();
        },
        meta: { title: 'myStake', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/pools',
        name: Components.Pools,
        component: Pools,
        meta: { title: 'pools', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/pools/:poolName',
        name: Components.PoolDetails,
        component: PoolDetails,
        meta: { title: 'poolDetails', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/farming',
        name: Components.Farming,
        component: Farming,
        meta: { title: 'farming', primaryNavigation: 'defi' },
      },
      {
        path: 'defi/polkamarkt/:marketId?',
        name: Components.Polkamarkt,
        component: Polkamarkt,
        meta: { title: 'polkamarkt', primaryNavigation: 'defi' },
      },
      {
        path: 'polkaswap',
        name: Components.Polkaswap,
        component: SoraSwap,
        meta: { title: 'soraSwap', primaryNavigation: 'polkaswap', embedded: true },
      },
      {
        path: 'polkaswap/disclaimer',
        name: Components.PolkaswapDisclaimer,
        component: PolkaswapDisclaimer,
        meta: { title: 'polkaswapDisclaimer', primaryNavigation: 'polkaswap' },
      },
      {
        path: 'cross-chain',
        name: Components.CrossChain,
        component: CrossChain,
        meta: { title: 'crossChain', primaryNavigation: 'cross-chain' },
      },
      {
        path: 'cross-chain/transfer/:assetId/:network',
        name: Components.CrossChainForm,
        component: CrossChainForm,
        meta: { title: 'crossChain', primaryNavigation: 'cross-chain' },
      },
      {
        path: 'settings',
        name: Components.Settings,
        component: Settings,
        meta: { title: 'settings', primaryNavigation: 'settings' },
      },
      {
        path: 'settings/networks-assets',
        name: Components.SettingsNetworksAssets,
        component: NetworksAssetsSettings,
        meta: { title: 'settings', primaryNavigation: 'settings' },
      },
      {
        path: 'settings/change-password',
        name: Components.SettingsChangePassword,
        component: ChangePassword,
        meta: { title: 'changePassword', primaryNavigation: 'settings' },
      },
      {
        path: 'settings/iroha-connect',
        name: Components.IrohaConnect,
        component: IrohaConnect,
        meta: { title: 'settings', primaryNavigation: 'settings' },
      },
      {
        path: 'settings/wallet-connect',
        name: Components.WalletConnectInitAuth,
        component: WalletConnectInitAuth,
        meta: { title: 'settings', primaryNavigation: 'settings' },
      },
      {
        path: 'settings/connections',
        component: AuthManagement,
        meta: { title: 'settings', primaryNavigation: 'settings' },
        children: [
          {
            path: '',
            name: Components.ManageAuths,
            component: ManageAuths,
            redirect: { name: Components.DAppsAuths, params: { type: 'substrate' } },
            children: [
              {
                path: 'dapps/:type',
                name: Components.DAppsAuths,
                component: DAppsAuths,
                meta: { primaryNavigation: 'settings' },
              },
              {
                path: 'wallet-connect',
                name: Components.WcAuths,
                component: WcAuths,
                meta: { primaryNavigation: 'settings' },
              },
            ],
          },
          {
            path: 'dapp/:type/:id',
            name: Components.DAppDetails,
            component: DAppDetails,
            meta: { primaryNavigation: 'settings' },
          },
          {
            path: 'wallet-connect/:topic',
            name: Components.WalletConnectAuthDetails,
            component: WalletConnectAuthDetails,
            meta: { primaryNavigation: 'settings' },
          },
        ],
      },
      {
        path: 'settings/accounts',
        component: AccountsLayout,
        meta: { title: 'settings', primaryNavigation: 'settings' },
        children: [
          {
            path: '',
            name: Components.AccountSetting,
            component: AccountSetting,
            meta: { title: 'accountSetting', primaryNavigation: 'settings' },
          },
          {
            path: 'chains/:type',
            name: Components.ChainAccounts,
            component: ChainAccounts,
            meta: { title: 'accounts', primaryNavigation: 'settings' },
          },
          {
            path: 'network/:network',
            name: Components.Nodes,
            component: Nodes,
            meta: { title: 'nodes', primaryNavigation: 'settings' },
          },
          {
            path: 'network/:network/export',
            name: Components.Export,
            component: Export,
            meta: { title: 'export', primaryNavigation: 'settings' },
          },
        ],
      },
    ],
    beforeEnter: async (to, from, next) => {
      const accountsStore = useAccountsStore();
      await initialAccountsReady;
      if (!hasSelectedWallet(accountsStore)) next({ name: Components.Welcome });
      else next();
    },
  },
  {
    path: '/accounts',
    redirect: { name: Components.AccountSetting },
  },
  {
    path: '/chain-accounts/:type',
    redirect: (to) => ({ name: Components.ChainAccounts, params: to.params, query: to.query }),
  },
  {
    path: '/accounts/:network/export',
    redirect: (to) => ({ name: Components.Export, params: to.params, query: to.query }),
  },
  {
    path: '/accounts/:network',
    redirect: (to) => ({ name: Components.Nodes, params: to.params, query: to.query }),
  },
  {
    path: '/:pathMatch(.*)*',
    component: Welcome,
    beforeEnter: async (to, from, next) => {
      const isLock = await keyringIsLocked();

      if (isLock) next({ name: Components.Unlock });
      else if (hasSelectedWallet(useAccountsStore())) next({ name: Components.Currencies });
      else next();
    },
  },
];

export default routes;
