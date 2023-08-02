<template>
  <div class="wallet">
    <header class="wallet-header">
      <div class="wallet-balance__container">
        <WalletBalance
          class="balance"
          :balance="summaryTransferableBalance"
          :changeWalletBalance="changeWalletBalance"
          @click.native="$emit('openFiatsPopup', true)"
        />

        <div class="wallet-balance__loading">
          <Loading :width="28" v-if="showShimmers" />
        </div>
      </div>
    </header>

    <SoraCardBanner />

    <ContentForm :height="contentFormHeight">
      <div class="content">
        <ContentSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :balances="filteredCurrencies"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementFormVisible"
          @toggleCurrenciesVisible="toggleCurrenciesVisible"
        />

        <Currencies
          v-if="showCurrencies"
          :balances="filteredCurrencies"
          :selectedNetwork="selectedNetwork"
          :showAssetsManagementForm="showAssetsManagementForm"
          :toggleVisibleActivityForm="toggleVisibleActivityForm"
          :filterValue="filterValue"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
        />
      </div>
    </ContentForm>

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :_selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false, {})"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false, {})"
    />

    <NetworkManagement
      v-if="showNetworkManagement"
      :networks="networksWithWarning"
      :closeForm="toggleNetworkManagementVisible"
      @setNetworkUnavailable="setNetworkUnavailable"
    />

    <NetworkUnavailablePopup
      v-if="showNetworkUnavailablePopup"
      :networks="networksWithWarning"
      :network="networkUnavailable"
      :closePopup="setNetworkUnavailable"
    />

    <GoogleExportPopup v-if="showGoogleExportPopup" :closePopup="closeGoogleExportPopup" />

    <Tooltip text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Mutation, Action } from 'vuex-class';
import type { SelectedWallet, GetShowWarningNetworks, SetHiddenAsset } from '@/store';
import type { AsyncFn, Fn, TabWallet } from '@/interfaces';
import { BalanceJson, TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import NFTs from '@/screens/wallet&asset/wallet/NFTs.vue';
import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import ContentSettings from '@/screens/wallet&asset/wallet/ContentSettings.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { ActionTypes as AccountsActionTypes } from '@/store/accounts/actions';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { AssetsPrice } from '@/interfaces';
import { defaultSortingCurrencies, filterBalanceItemsByNetwork } from '@/helpers/currencies';
import { getChangeWalletBalance, getSummaryTransferableWalletBalance, isNetworkGroup } from '@/helpers/common';
import { SORA_CARD_BANNER_HEIGHT } from '@/consts/soraCard';
import SoraCardBanner from '@/screens/soraCard/SoraCardBanner.vue';
import { NETWORK_STATUS } from '@/extension/background/extension-base/src/api/types/networks';

@Component({
  components: {
    NFTs,
    SendForm,
    Currencies,
    ReceiveForm,
    WalletBalance,
    SoraCardBanner,
    ContentSettings,
    NetworkManagement,
    SelectNetworkPopup,
    SelectNetworkButton,
    NetworkUnavailablePopup,
    GoogleExportPopup,
  },
})
export default class Wallet extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  showNetworkManagement = false;
  showAssetsManagementForm = false;
  showSendForm = false;
  showReceiveForm = false;
  networkUnavailable = '';
  activeTabName: TabWallet = 'Currencies';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getShowWarningNetwork) getShowWarningNetwork!: GetShowWarningNetworks;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getIsCustomSort) isCustomSort!: (address: string) => boolean;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(AccountsGettersTypes.showSoraCardBanner) showSoraCardBanner!: boolean;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getPrice) prices!: AssetsPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getGenesisHashByNetwork!: (value: string) => string;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: Fn<string>;
  @Mutation(AccountsMutationTypes.SET_HIDDEN_ASSET) setHiddenAssets!: Fn<SetHiddenAsset>;
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;

  get contentFormHeight() {
    const subtractionNumber = this.showSoraCardBanner ? SORA_CARD_BANNER_HEIGHT : 0;

    // IMPORTANT: if <Menu /> showed use 397
    return 457 - subtractionNumber;
  }

  get showNetworkUnavailablePopup() {
    return this.networkUnavailable !== '';
  }

  get showWarningIcon() {
    if (this.selectedNetwork !== ALL_NETWORKS) {
      const apiStatus = this.networks.find(
        ({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()
      )?.apiStatus;

      return apiStatus === NETWORK_STATUS.DISCONNECTED;
    }

    return this.networksWithWarning.length !== 0;
  }

  get disconnectedNetworks() {
    return this.networks.filter(({ apiStatus }) => apiStatus === NETWORK_STATUS.DISCONNECTED);
  }

  get networksWithWarning() {
    return this.disconnectedNetworks.filter(({ name }) => !this.getShowWarningNetwork(name));
  }

  get summaryTransferableBalance() {
    return getSummaryTransferableWalletBalance(this.balances, this.prices, this.selectedNetwork);
  }

  get changeWalletBalance() {
    if (this.balances.length === 0) return { percent: 0, amount: 0 };

    return getChangeWalletBalance(this.balances, this.prices, this.selectedNetwork);
  }

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    if (!this.isCustomSort(address)) return defaultSortingCurrencies(this.balances, this.prices, this.selectedNetwork);

    const sequence = accountController.getSequenceAssetsByAddress(address);

    return this.balances.sort((currency1, currency2) => {
      const index1 = sequence.indexOf(currency1.assetId);
      const index2 = sequence.indexOf(currency2.assetId);

      return index1 - index2;
    });
  }

  get showShimmers() {
    if (this.selectedNetwork !== ALL_NETWORKS) {
      const apiStatus = this.networks.find(
        ({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()
      )?.apiStatus;

      return apiStatus === NETWORK_STATUS.PENDING;
    }

    const isPendingExists = this.networks.some(({ apiStatus }) => apiStatus === NETWORK_STATUS.PENDING);

    return !this.isOnline || isPendingExists;
  }
  get filteredCurrencies() {
    const isAllNetworks = this.selectedNetwork === ALL_NETWORKS;

    const filteredByNetwork = isAllNetworks
      ? this.sortedCurrencies
      : this.sortedCurrencies.filter(({ balances }) => {
          return balances.some((balance) => filterBalanceItemsByNetwork(balance, this.selectedNetwork));
        });

    if (this.showAssetsManagementForm) return filteredByNetwork;

    const filter = this.filterValue.trim().toLowerCase();

    return filteredByNetwork.filter(({ symbol }) => symbol.includes(filter));
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showGoogleExportPopup() {
    return this.$route.params.access_token && this.$route.params.access_token !== 'null';
  }

  @Watch('networksWithWarning')
  connect(value: string[]) {
    if (value.length === 0) this.showNetworkManagement = false;
  }

  closeGoogleExportPopup() {
    this.$router.replace('/').catch((e) => e);

    this.$emit('closeSelectWalletPopup');
  }

  deactivated() {
    this.showAssetsManagementForm = false;
    this.showNetworkManagement = false;
    this.filterValue = '';

    this.setNetworkUnavailable();
  }

  setNetworkUnavailable(network = '') {
    this.networkUnavailable = network;
  }

  toggleNetworkManagementVisible() {
    this.showNetworkManagement = !this.showNetworkManagement;
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible(allCurrenciesHidden: boolean) {
    if (allCurrenciesHidden) {
      this.balances.forEach(({ assetId }) => this.setHiddenAssets({ assetId, value: true }));

      return;
    }

    this.balances.forEach(({ assetId, balances }) => {
      const index = balances.findIndex(({ transferable }) => transferable && transferable !== '0');
      const isZeroBalance = index === -1;

      if (isZeroBalance) this.setHiddenAssets({ assetId, value: false });
    });

    const assetsVisibleWithBalance = this.balances.filter(({ balances, assetId }) => {
      const haveAssets = balances.findIndex(({ transferable }) => transferable && transferable !== '0') !== -1;
      const isVisibleAsset = !this.hiddenAssets.includes(assetId);

      return isVisibleAsset && haveAssets;
    });

    const assetsInvisibleWithBalance = this.balances.filter(({ balances, assetId }) => {
      const haveAssets = balances.findIndex(({ transferable }) => transferable && transferable !== '0') !== -1;
      const isHiddenAsset = this.hiddenAssets.includes(assetId);

      return isHiddenAsset && haveAssets;
    });

    const assetsInvisibleWithoutBalance = this.balances.filter(({ balances, assetId }) => {
      const notHaveAssets = balances.findIndex(({ transferable }) => transferable && transferable !== '0') === -1;
      const isHiddenAsset = this.hiddenAssets.includes(assetId);

      return isHiddenAsset && notHaveAssets;
    });

    this.setBalance({
      details: [...assetsVisibleWithBalance, ...assetsInvisibleWithBalance, ...assetsInvisibleWithoutBalance],
      reset: false,
      saveSequence: true,
    });
  }

  toggleVisibleActivityForm(
    field: 'showSendForm' | 'showReceiveForm',
    value = true,
    currency: { mainNetwork?: string; assetId?: string }
  ) {
    this.selectedCurrency = currency;
    this[field] = value;

    if (!isNetworkGroup(this.selectedNetwork)) this.selectedCurrency.mainNetwork = this.selectedNetwork;
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: TabWallet) {
    this.activeTabName = name;
  }
}
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;

  .content {
    padding: $default-padding 0 0 $default-padding;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .wallet-header {
    min-height: 46px;
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .wallet-balance__container {
    display: flex;
    flex-flow: row;
    gap: 5px;
  }

  .wallet-balance__loading {
    height: 46px;
  }

  .balance {
    font-size: 22px;
    line-height: 28px;
    max-width: 245px;
  }

  .balance-shimmers {
    display: flex;
    flex-direction: column;

    .balance-shimmer {
      margin-bottom: 5px;
    }
  }
}
</style>
