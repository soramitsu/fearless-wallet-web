import type { MutationTree } from 'vuex';
import type { SelectedWallet, SetAccountsProps, SetAutoSelectNode, SetHiddenAsset } from './types';
import type { State } from './state';
import type { BalanceJson } from '@extension-base/background/types/types';
import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import { accountController } from '@/controllers';

export enum MutationTypes {
  SET_SELECTED_WALLET = 'SET_SELECTED_WALLET',
  SET_SELECTED_FIAT = 'SET_SELECTED_FIAT',
  SET_SELECTED_NETWORK = 'SET_SELECTED_NETWORK',
  SET_ACCOUNTS = 'SET_ACCOUNTS',
  SET_ADDRESSES = 'SET_ADDRESSES',
  SET_CUSTOM_SORT = 'SET_CUSTOM_SORT',
  SET_AUTO_SELECT_NODE = 'SET_AUTO_SELECT_NODE',
  SET_HIDDEN_ASSET = 'SET_HIDDEN_ASSET',
  SET_QR = 'SET_QR',
  DELETE_QR = 'DELETE_QR',
  HIDE_POLKASWAP_ALERT = 'HIDE_POLKASWAP_ALERT',
  HIDE_NETWORK_WARNING = 'HIDE_NETWORK_WARNING',
  SET_BALANCE = 'SET_BALANCE',
  SET_NFTS = 'SET_NFTS',
  SET_AVAILABLE_NFTS = 'SET_AVAILABLE_NFTS',
  SET_SORA_CARD_BANNER_VISIBILITY = 'SET_SORA_CARD_BANNER_VISIBILITY',
}

export type Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state: State, props: SelectedWallet): void;
  [MutationTypes.SET_BALANCE](state: State, props: BalanceJson): void;
  [MutationTypes.SET_SELECTED_FIAT](state: State, props: string): void;
  [MutationTypes.SET_SELECTED_NETWORK](state: State, network: string): void;
  [MutationTypes.SET_ACCOUNTS](state: State, props: SetAccountsProps): void;
  [MutationTypes.SET_AUTO_SELECT_NODE](state: State, props: SetAutoSelectNode): void;
  [MutationTypes.SET_QR](state: State, props: string): void;
  [MutationTypes.DELETE_QR](state: State): void;
  [MutationTypes.SET_NFTS](state: State, nfts: ChainNftState): void;
  [MutationTypes.SET_AVAILABLE_NFTS](state: State, nfts: AvailableNftState): void;
  [MutationTypes.SET_HIDDEN_ASSET](state: State, props: SetHiddenAsset): void;
  [MutationTypes.SET_CUSTOM_SORT](state: State, props: string): void;
  [MutationTypes.HIDE_POLKASWAP_ALERT](state: State, value: boolean): void;
  [MutationTypes.HIDE_NETWORK_WARNING](state: State, network: string): void;
  [MutationTypes.SET_SORA_CARD_BANNER_VISIBILITY](state: State, value: boolean): void;
};

const mutations: MutationTree<State> & Mutations = {
  [MutationTypes.SET_SELECTED_WALLET](state, { address, ethereumAddress, name, isMobile }) {
    state.selectedWallet = {
      address: address,
      ethereumAddress: ethereumAddress,
      name: name ?? '',
      isMobile: isMobile,
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

  [MutationTypes.SET_ACCOUNTS](state, { accounts, isMobileUpdate }) {
    if (isMobileUpdate) {
      const nativeWallets = state.accounts.filter((account) => !account.isMobile);
      state.accounts = [...nativeWallets, ...accounts];
    } else {
      const mobileWallets = state.accounts.filter((account) => account.isMobile);

      state.accounts = [...mobileWallets, ...accounts];
    }

    accountController.setAccounts(state.accounts);

    return;
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

  [MutationTypes.SET_NFTS](state, nfts) {
    state.nfts = nfts;
  },

  [MutationTypes.SET_AVAILABLE_NFTS](state, nfts) {
    state.availableNfts = nfts;
  },

  [MutationTypes.SET_HIDDEN_ASSET](state, { groupId, value }) {
    const address = state.selectedWallet.address;
    const hiddenAssets = state.hiddenAssets[address] ?? [];

    if (value) {
      const index = state.hiddenAssets[address].findIndex((id) => id === groupId);

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
        [address]: Array.from(new Set([...hiddenAssets, groupId])),
      };
    }

    accountController.setHiddenAssets(state.hiddenAssets);
  },
};

export default mutations;
