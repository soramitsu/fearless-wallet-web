import type {
  MigrateLegacyAssetPreferences,
  SetAssetPreference,
  SetAutoSelectNode,
  SetAccountsProps,
  SetHiddenAsset,
} from './types';
import type { AccountJson, BalanceJson } from '@extension-base/background/types/types';
import type { AccountStore } from '@/stores/accounts';
import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import { accountController } from '@/controllers/accountController';
import { WalletEcosystem } from '@/interfaces';
import { acceptSoraDisclaimer, getSoraDisclaimerStatus } from '@/extension/messaging/sora-policy';
import { SORA_DISCLAIMER_VERSION } from '@/defi/soraDisclaimer';

type Actions = {
  setSelectedWallet(this: AccountStore, props: AccountJson | undefined): void;
  setBalance(this: AccountStore, props: BalanceJson): void;
  setNfts(this: AccountStore, nfts: ChainNftState): void;
  setSelectedFiat(this: AccountStore, props: string): void;
  setAccounts(this: AccountStore, props: SetAccountsProps): void;
  setAutoSelectNode(this: AccountStore, props: SetAutoSelectNode): void;
  setHiddenAssets(this: AccountStore, props: SetHiddenAsset): void;
  setAssetPreference(this: AccountStore, props: SetAssetPreference): void;
  migrateLegacyAssetPreferences(this: AccountStore, props: MigrateLegacyAssetPreferences): void;
  setSelectedNetwork(this: AccountStore, network: string): void;
  hidePolkaswapAlert(this: AccountStore): Promise<boolean>;
  syncSoraDisclaimerStatus(this: AccountStore): Promise<boolean>;
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
      bitcoinAddress: account?.bitcoinAddress,
      bitcoinTestnetAddress: account?.bitcoinTestnetAddress,
      solanaAddress: account?.solanaAddress,
      irohaAddress: account?.irohaAddress,
      irohaPublicKeyHex: account?.irohaPublicKeyHex,
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
    this.availableNfts = { ...this.availableNfts, ...nfts };
  },

  setBalance({ details, saveSequence = false, scanStates }) {
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
    if (scanStates) this.networkScanStates = scanStates;
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

  setAssetPreference({ key, preference }) {
    const address = this.selectedWallet.address;
    const current = this.assetPreferencesForAllAccounts[address] ?? {};

    this.assetPreferencesForAllAccounts = {
      ...this.assetPreferencesForAllAccounts,
      [address]: { ...current, [key]: preference },
    };

    accountController.setAssetPreferences(this.assetPreferencesForAllAccounts);
  },

  migrateLegacyAssetPreferences({ assets, complete }) {
    const address = this.selectedWallet.address;
    if (!address || !complete || accountController.getAssetPreferenceMigrationState()[address]) return;

    const legacyHidden = new Set(this.hiddenAssetsForAllAccounts[address] ?? []);
    const current = { ...(this.assetPreferencesForAllAccounts[address] ?? {}) };

    assets.forEach(({ key, groupId }) => {
      if (legacyHidden.has(groupId) && current[key] === undefined) current[key] = 'hidden';
    });

    this.assetPreferencesForAllAccounts = {
      ...this.assetPreferencesForAllAccounts,
      [address]: current,
    };
    accountController.setAssetPreferences(this.assetPreferencesForAllAccounts);
    accountController.setAssetPreferenceMigrationComplete(address);
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

  async hidePolkaswapAlert() {
    const status = await acceptSoraDisclaimer(SORA_DISCLAIMER_VERSION);
    this.showPolkaswapAlert = !status.accepted;
    if (status.accepted) accountController.setAgreeSwapDisclaimer();

    return status.accepted;
  },

  async syncSoraDisclaimerStatus() {
    try {
      const status = await getSoraDisclaimerStatus();
      this.showPolkaswapAlert = !status.accepted;
      if (status.accepted) accountController.setAgreeSwapDisclaimer();
      else accountController.clearAgreeSwapDisclaimer();

      return status.accepted;
    } catch {
      this.showPolkaswapAlert = true;
      accountController.clearAgreeSwapDisclaimer();
      return false;
    }
  },
};
