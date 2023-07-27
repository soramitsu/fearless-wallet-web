import type { MutationTree } from 'vuex';
import type { AssetTipDataProps, SelectedWallet, SetAccountsProps, SetAutoSelectNode, SetHiddenAsset } from './types';
import type { State } from './state';
import type { BalanceJson } from '@/extension/background/extension-base/src/background/types/types';
import { accountController } from '@/controllers';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ONLINE_STATUS = 'SET_ONLINE_STATUS',
  SET_ADDRESSES = 'SET_ADDRESSES',
  SET_CUSTOM_SORT = 'SET_CUSTOM_SORT',
  SET_AUTO_SELECT_NODE = 'SET_AUTO_SELECT_NODE',
  SET_HIDDEN_ASSET = 'SET_HIDDEN_ASSET',
  SET_QR = 'SET_QR',
  DELETE_QR = 'DELETE_QR',
  HIDE_POLKASWAP_ALERT = 'HIDE_POLKASWAP_ALERT',
  HIDE_NETWORK_WARNING = 'HIDE_NETWORK_WARNING',
  SET_BALANCE = 'SET_BALANCE',
  SET_SORA_CARD_BANNER_VISIBILITY = 'SET_SORA_CARD_BANNER_VISIBILITY',
  SET_ASSET_TIP_STATE = 'SET_ASSET_TIP_STATE',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SelectedWallet): void;
  [MutationTypes.SET_BALANCE](state: State, props: BalanceJson): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: string): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, network: string): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: SetAccountsProps): void;
  [MutationTypes.SET_ONLINE_STATUS](state: State, isOnline: boolean): void;
  [MutationTypes.SET_AUTO_SELECT_NODE](state: State, props: SetAutoSelectNode): void;
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.SET_ASSET_TIP_STATE](state: State, props: AssetTipDataProps): void;
  [MutationTypes.DELETE_QR](state: State): void;
  [MutationTypes.SET_HIDDEN_ASSET](state: State, props: SetHiddenAsset): void;
  [MutationTypes.SET_CUSTOM_SORT](state: State, props: string): void;
  [MutationTypes.HIDE_POLKASWAP_ALERT](state: State, value: boolean): void;
  [MutationTypes.HIDE_NETWORK_WARNING](state: State, network: string): void;
  [MutationTypes.SET_SORA_CARD_BANNER_VISIBILITY](state: State, value: boolean): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, account) {
    state.selectedWallet = {
      address: account.address,
      ethereumAddress: account.ethereumAddress,
      name: account.name ?? '',
    };
  },

  [MutationTypes.SET_SELECTED_FIAT](state, fiatName) {
    accountController.setSelectedFiat(fiatName);

    state.selectedFiat = fiatName;
  },

  [MutationTypes.SET_SELECTED_NETWORK](state, network) {
    const {
      selectedWallet: { address },
      selectedNetworks,
    } = state;

    accountController.setSelectedNetwork(address, network);

    state.selectedNetworks = { ...selectedNetworks, [address]: network };
  },

  [MutationTypes.SET_ONLINE_STATUS](state, isOnline) {
    state.isOnline = isOnline;
  },

  [MutationTypes.SET_ACCOUNTS](state, { accounts, isMobileUpdate }) {
    const mobileIndex = state.accounts.findIndex((account) => account.isMobile);
    const isMobileWalletExists = mobileIndex !== -1;

    if (accounts.length !== 0) {
      if (isMobileUpdate) {
        isMobileWalletExists ? state.accounts.splice(mobileIndex, 1, accounts[0]) : state.accounts.push(accounts[0]);
      } else {
        state.accounts = isMobileWalletExists ? [state.accounts[mobileIndex], ...accounts] : accounts;
      }

      accountController.setAccounts(state.accounts);

      return;
    }

    if (isMobileUpdate) {
      if (isMobileWalletExists) state.accounts.splice(mobileIndex, 1);
    } else {
      state.accounts = isMobileWalletExists ? [state.accounts[mobileIndex]] : [];
    }

    accountController.setAccounts(state.accounts);
  },

  [MutationTypes.HIDE_POLKASWAP_ALERT](state) {
    setTimeout(() => {
      state.showPolkaswapAlert = false;

      accountController.setAgreeSwapDisclaimer();
    }, 100);
  },

  [MutationTypes.SET_AUTO_SELECT_NODE](state, { network, value }) {
    accountController.setAutoSelectNodes(value, network);

    state.autoSelectNode = { ...state.autoSelectNode, [network]: value };
  },

  [MutationTypes.SET_QR](state, payload) {
    state.qr = payload;
  },

  [MutationTypes.SET_SORA_CARD_BANNER_VISIBILITY](state, value) {
    accountController.setHidingSoraCardBannerTime(Date.now());

    state.showSoraCardBanner = value;
  },

  [MutationTypes.DELETE_QR](state) {
    state.qr = null;
  },

  [MutationTypes.HIDE_NETWORK_WARNING](state, network) {
    const { hiddenWarningNetworks } = state;

    accountController.setHiddenWarningNetwork(network);

    state.hiddenWarningNetworks = [...hiddenWarningNetworks, network];
  },

  [MutationTypes.SET_CUSTOM_SORT](state, address: string) {
    accountController.setCustomSort(address);

    state.isCustomSort = {
      ...state.isCustomSort,
      [address]: true,
    };
  },

  [MutationTypes.SET_BALANCE](state, { details }) {
    state.balances = details;
  },

  [MutationTypes.SET_ASSET_TIP_STATE](state, payload) {
    state.assetTipShowed = payload;

    accountController.setAssetTipData(payload.count, payload.time);
  },

  [MutationTypes.SET_HIDDEN_ASSET](state, { assetId, value }) {
    const address = state.selectedWallet.address;
    const hiddenAssets = state.hiddenAssets[address] ?? [];

    if (value) {
      const index = state.hiddenAssets[address].findIndex((id) => id === assetId);

      hiddenAssets.splice(index, 1);

      if (index !== -1) {
        state.hiddenAssets = {
          ...state.hiddenAssets,
          [address]: hiddenAssets,
        };
      }
    } else {
      state.hiddenAssets = {
        ...state.hiddenAssets,
        [address]: Array.from(new Set([...hiddenAssets, assetId])),
      };
    }

    accountController.setHiddenAssets(state.hiddenAssets);
  },
};

export default mutations;
