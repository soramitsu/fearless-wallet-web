import type { SetAutoSelectNode, SetAccountsProps, SetHiddenAsset } from './types';
import type { AccountJson, BalanceJson } from '@extension-base/background/types/types';
import type { AccountStore } from '@/stores/accounts';
import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import { accountController } from '@/controllers/accountController';
import { WalletEcosystem } from '@/interfaces';

type Actions = {
  setSelectedWallet(this: AccountStore, props: AccountJson | undefined): void;
  setBalance(this: AccountStore, props: BalanceJson): void;
  setNfts(this: AccountStore, nfts: ChainNftState): void;
  setSelectedFiat(this: AccountStore, props: string): void;
  setAccounts(this: AccountStore, props: SetAccountsProps): void;
  setAutoSelectNode(this: AccountStore, props: SetAutoSelectNode): void;
  setHiddenAssets(this: AccountStore, props: SetHiddenAsset): void;
  setSelectedNetwork(this: AccountStore, network: string): void;
  hidePolkaswapAlert(this: AccountStore): void;
  hideNetworkWarning(this: AccountStore, network: string): void;
  setIsBalanceLoading(this: AccountStore, value: boolean): void;
  setAvailableNfts(this: AccountStore, nfts: AvailableNftState): void;
};

export const actions: Actions = {
  setSelectedWallet(account) {
    if (account?.address !== this.selectedWallet.address) this.setIsBalanceLoading(true);

    this.selectedWallet = {
      address: account?.address ?? '',
      ethereumAddress: account?.ethereumAddress ?? '',
      walletEcosystem: account?.walletEcosystem,
      name: account?.name ?? '',
      isMobile: account?.isMobile ?? false,
      isMasterAccount: account?.isMasterAccount ?? false,
      isMasterPassword: account?.isMasterPassword ?? false,
      haveEntropy: account?.haveEntropy ?? false,
      isSubstrate: account?.walletEcosystem === WalletEcosystem.Substrate,
      isTon: account?.walletEcosystem === WalletEcosystem.Ton,
      hasEthereum: account?.ethereumAddress !== '',
    };
  },

  setAvailableNfts(nfts) {
    this.availableNfts = nfts;
  },

  setBalance({ details, saveSequence = false }) {
    if (saveSequence) {
      const address = this.selectedWallet.address;
      const sequence = details.map(({ groupId }) => groupId);

      accountController.setSequenceAssets(sequence, address);

      accountController.setCustomSort(address);

      this.isCustomSorted = {
        ...this.isCustomSorted,
        [address]: true,
      };
    }

    this.balances = details;
  },

  hideNetworkWarning(network) {
    accountController.setHiddenWarningNetwork(network);

    this.hiddenWarningNetworks = [...this.hiddenWarningNetworks, network];
  },

  setNfts(nfts) {
    this.$state.nfts = nfts;
  },

  setIsBalanceLoading(value) {
    this.isBalanceLoading = value;
  },

  setHiddenAssets({ groupId, value }) {
    const address = this.selectedWallet.address;
    const hiddenAssets = this.hiddenAssetsForAllAccounts[address] ?? [];

    if (value) {
      const index = this.hiddenAssetsForAllAccounts[address].findIndex((id) => id === groupId);

      if (index !== -1) {
        hiddenAssets.splice(index, 1);

        this.hiddenAssetsForAllAccounts = {
          ...this.hiddenAssetsForAllAccounts,
          [address]: hiddenAssets,
        };
      }
    } else {
      this.hiddenAssetsForAllAccounts = {
        ...this.hiddenAssetsForAllAccounts,
        [address]: Array.from(new Set([...hiddenAssets, groupId])),
      };
    }

    accountController.setHiddenAssets(this.hiddenAssetsForAllAccounts);
  },

  setSelectedFiat(fiatName) {
    this.selectedFiat = fiatName;
  },

  setAccounts({ accounts }) {
    this.accounts = accounts;
  },

  setSelectedNetwork(network) {
    const {
      selectedWallet: { address },
      selectedNetworks,
    } = this;

    this.selectedNetworks = { ...selectedNetworks, [address]: network };
  },

  setAutoSelectNode({ network, value }) {
    accountController.setAutoSelectNodes(value, network);

    this.autoSelectNode = { ...this.autoSelectNode, [network]: value };
  },

  hidePolkaswapAlert() {
    setTimeout(() => {
      this.showPolkaswapAlert = false;

      accountController.setAgreeSwapDisclaimer();
    }, 100);
  },
};
