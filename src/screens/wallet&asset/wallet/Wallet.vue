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

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        :showWarningIcon="showWarningIcon"
        @openNetworkPopup="toggleSelectNetworkPopupVisible"
        @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
      />
    </header>

    <SelectNetworkPopup
      v-if="showSelectNetworkPopup"
      :selectedNetwork="selectedNetwork"
      :height="410"
      :toggleSelectedNetwork="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

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
      :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)"
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
import { addNumbers, getChangeWalletBalance, getSummaryTransferableWalletBalance } from '@/helpers/numbers';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { AssetsPrice } from '@/interfaces';
import { defaultSortingCurrencies, getTotalBalance } from '@/helpers/currencies';
import { NETWORK_STATUS } from '@/extension/background/extension-base/src/api/evm/types/ether';
import { tieAccount } from '@/extension/messaging';
import { SORA_CARD_BANNER_HEIGHT } from '@/consts/soraCard';
import SoraCardBanner from '@/screens/soraCard/SoraCardBanner.vue';

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
  showSelectNetworkPopup = false;
  networkUnavailable = '';
  activeTabName: TabWallet = 'Currencies';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getShowWarningNetworks) getShowWarningNetworks!: GetShowWarningNetworks;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getIsCustomSort) isCustomSort!: (address: string) => boolean;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(AccountsGettersTypes.showSoraCardBanner) showSoraCardBanner!: boolean;
  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworkJsonOld[];
  @Getter(NetworksGettersTypes.getPrice) prices!: AssetsPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJsonOld;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getGenesisHashByNetwork!: (value: string) => string;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: Fn<string>;
  @Mutation(AccountsMutationTypes.SET_HIDDEN_ASSET) setHiddenAssets!: Fn<SetHiddenAsset>;
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;

  get contentFormHeight() {
    const subtractionNumber = this.showSoraCardBanner ? SORA_CARD_BANNER_HEIGHT : 0;

    return 397 - subtractionNumber;
  }

  get showNetworkUnavailablePopup() {
    return this.networkUnavailable !== '';
  }

  get showWarningIcon() {
    if (this.selectedNetwork !== ALL_NETWORKS) return !!this.disconnectedNetworks.length;

    return this.networksWithWarning.length !== 0;
  }

  get disconnectedNetworks() {
    return this.networks.filter(({ apiStatus }) => apiStatus === NETWORK_STATUS.DISCONNECTED);
  }

  get summaryTransferableBalance() {
    return getSummaryTransferableWalletBalance(this.balances, this.prices);
  }

  get changeWalletBalance() {
    if (this.balances.length === 0) return { totalBalance: 0, changeAmount: 0 };

    return getChangeWalletBalance(this.balances, this.prices);
  }

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    if (!this.isCustomSort(address)) {
      const isAllNetworks = this.selectedNetwork === ALL_NETWORKS;
      const network = isAllNetworks ? undefined : this.selectedNetwork;

      return defaultSortingCurrencies(this.balances, network);
    }

    const sequence = accountController.getSequenceAssetsByAddress(address);

    return this.balances.sort((currency1, currency2) => {
      const index1 = sequence.indexOf(currency1.assetId);
      const index2 = sequence.indexOf(currency2.assetId);

      return index1 - index2;
    });
  }

  get showShimmers() {
    const isPendingExists = this.networks.some(({ apiStatus }) => apiStatus === NETWORK_STATUS.PENDING);

    return !this.isOnline || isPendingExists;
  }

  get filteredCurrencies() {
    const filter = this.filterValue.trim().toLowerCase();

    const isAllNetworks = this.selectedNetwork === ALL_NETWORKS;

    return this.sortedCurrencies.filter((currency) => {
      const walletBalance = currency.balances.map(({ name }) => name);
      const isAvailableInSelectedNetwork = walletBalance.includes(this.selectedNetwork);

      if (!isAllNetworks && !isAvailableInSelectedNetwork) return false;

      return currency.name.includes(filter);
    });
  }

  get totalBalance() {
    const arr = this.sortedCurrencies.map((currency) => getTotalBalance(currency));

    return +addNumbers(arr);
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showGoogleExportPopup() {
    return this.$route.params.access_token && this.$route.params.access_token !== 'null';
  }

  get networksWithWarning() {
    return this.disconnectedNetworks.filter(({ name }) => !this.getShowWarningNetworks(name));
  }

  @Watch('networksWithWarning')
  connect(value: string[]) {
    if (value.length === 0) this.showNetworkManagement = false;
  }

  closeGoogleExportPopup() {
    this.$router.replace('/');

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

    this.toggleSelectNetworkPopupVisible(false);
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
    currency: { mainNetwork: string; assetId: string }
  ) {
    this[field] = value;
    this.selectedCurrency = currency;
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    const prepNetwork = network === 'All' ? null : `0x${this.getNetwork(network).chainId}`;

    this.setSelectedNetwork(network);

    tieAccount(this.selectedWallet.address, prepNetwork);

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible(value?: boolean) {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = value ?? !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '400' : '0';
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
