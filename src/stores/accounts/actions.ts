import type { SetAssetPreference, SetAssetPreferences, SetAutoSelectNode, SetAccountsProps } from './types';
import type { AccountJson, BalanceJson } from '@extension-base/background/types/types';
import type { AccountStore } from '@/stores/accounts';
import type { AvailableNftState, ChainNftState } from '@extension-base/services/nft-service/types';
import type { PortfolioViewSettings } from '@/portfolio/portfolioViewSettings';
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
  setAssetPreference(this: AccountStore, props: SetAssetPreference): void;
  setAssetPreferences(this: AccountStore, props: SetAssetPreferences): void;
  updatePortfolioView(this: AccountStore, patch: Partial<PortfolioViewSettings>): void;
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

  setBalance({ details, scanStates }) {
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

  setAssetPreference({ key, preference }) {
    this.setAssetPreferences({ entries: [{ key, preference }] });
  },

  // Only explicit choices are stored here. Hides from 3.0.5 are derived on read by usePortfolioPreferences,
  // and the 3.0.5 keys themselves are never written.
  setAssetPreferences({ entries }) {
    if (entries.length === 0) return;

    const address = this.selectedWallet.address;
    const current = { ...(this.assetPreferencesForAllAccounts[address] ?? {}) };

    entries.forEach(({ key, preference }) => (current[key] = preference));

    this.assetPreferencesForAllAccounts = {
      ...this.assetPreferencesForAllAccounts,
      [address]: current,
    };

    accountController.setAssetPreferences(this.assetPreferencesForAllAccounts);
  },

  // View state only (filters, collapse, notice acknowledgement); it never writes an asset preference.
  updatePortfolioView(patch) {
    const address = this.selectedWallet.address;
    if (!address) return;

    this.portfolioViewForAllAccounts = {
      ...this.portfolioViewForAllAccounts,
      [address]: { ...this.portfolioView, ...patch },
    };

    try {
      accountController.setPortfolioViewSettings(this.portfolioViewForAllAccounts);
    } catch {
      // A convenience preference: the in-memory value still applies until the popup closes.
    }
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
