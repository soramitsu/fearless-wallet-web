<template>
  <div class="wallet">
    <header class="wallet-header">
      <div class="wallet-balance__container">
        <WalletBalance
          class="balance"
          :balance="totalBalance"
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

    <ContentForm :height="397">
      <div class="content">
        <ContentSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :currencies="filteredCurrencies"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementFormVisible"
          @toggleCurrenciesVisible="toggleCurrenciesVisible"
        />

        <Currencies
          v-if="showCurrencies"
          :key="currenciesKey"
          :balances="filteredCurrencies"
          :selectedNetwork="selectedNetwork"
          :showAssetsManagementForm="showAssetsManagementForm"
          :toggleVisibleActivityForm="toggleVisibleActivityForm"
          :filterValue="filterValue"
          @setCustomSort="setCustomSort"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
        />
      </div>
    </ContentForm>

    <SendFormStateLess
      v-if="showSendForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :_selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false)"
    />

    <ReceiveFormStateLess
      v-if="showReceiveForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)"
    />

    <NetworkManagement
      v-if="showNetworkManagement"
      :disconnectedNetworks="[]"
      :closeForm="toggleNetworkManagementVisible"
      @setNetworkUnavailable="setNetworkUnavailable"
    />

    <NetworkUnavailablePopup v-if="showNetworkUnavailablePopup" :closePopup="setNetworkUnavailable" />

    <GoogleExportPopup v-if="showGoogleExportPopup" :closePopup="closeGoogleExportPopup" />

    <Tooltip text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import type { TMutation, TabWallet } from '@/interfaces/common';
import type { SetSelectedNetworkProps, SelectedWallet } from '@/store';
import NFTs from '@/screens/wallet&asset/wallet/NFTs.vue';
import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import CurrencyItemStateLess from '@/screens/wallet&asset/wallet/CurrencyItemStateLess.vue';
import ContentSettings from '@/screens/wallet&asset/wallet/ContentSettings.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import ReceiveFormStateLess from '@/screens/wallet&asset/wallet/ReceiveFormStateLess.vue';
import SendFormStateLess from '@/screens/wallet&asset/wallet/SendFormStateLess.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { addNumbers, getChangeWalletBalance } from '@/helpers/numbers';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import Loading from '@/components/Loading.vue';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types';
import { defaultSortingCurrencies, getTotalBalance } from '@/helpers/currencies';
import { ALL_NETWORKS } from '@/consts/networks';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';
import { AssetsPrice } from '@/interfaces';

@Component({
  components: {
    NFTs,
    SendFormStateLess,
    Currencies,
    CurrencyItemStateLess,
    ReceiveFormStateLess,
    WalletBalance,
    Loading,
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
  currenciesKey = 0;
  activeTabName: TabWallet = 'Currencies';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };
  evmCurrencies = {};
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: Record<string, TokenBalance>;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getIsCustomSort) isCustomSort!: (address: string) => boolean;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworkJsonOld[];
  @Getter(NetworksGettersTypes.getPrice) prices!: AssetsPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJsonOld;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getGenesisHashByNetwork!: (value: string) => string;
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: TMutation<SetSelectedNetworkProps>;
  @Mutation(AccountsMutationTypes.SET_CUSTOM_SORT) setCustomSorting!: TMutation<string>;

  get showNetworkUnavailablePopup() {
    return this.networkUnavailable !== '';
  }

  get showWarningIcon() {
    if (this.selectedNetwork !== ALL_NETWORKS)
      return (
        this.networks.find((el) => el.name.toLowerCase() === this.selectedNetwork.toLowerCase())?.apiStatus ===
        'disconnected'
      );

    return this.disconnectedNetworks.length !== 0;
  }

  get nets() {
    return this.networks ? this.networks : [];
  }

  get disconnectedNetworks() {
    return this.networks.filter(({ apiStatus }) => apiStatus === 'disconnected');
  }

  get balancePrep() {
    return Object.values(this.balances);
  }

  get changeWalletBalance() {
    if (this.balancePrep.length === 0) return { totalBalance: 0, changeAmount: 0 };

    return getChangeWalletBalance(this.balancePrep, this.prices);
  }

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    const sequence = accountController.getSequenceAssetsByAddress(address, this.selectedNetwork);

    return this.balancePrep.sort((currency1, currency2) => {
      const { name: assetId1 } = currency1;
      const { name: assetId2 } = currency2;
      const index1 = sequence.indexOf(assetId1);
      const index2 = sequence.indexOf(assetId2);

      return index1 - index2;
    });
  }

  get showShimmers() {
    const index = this.networks.findIndex(({ apiStatus }) => {
      return apiStatus === 'pending';
    });

    return !this.isOnline || index !== -1;
  }

  get filteredCurrencies() {
    const filter = this.filterValue.trim().toLowerCase();

    const isAllNetworks = this.selectedNetwork === ALL_NETWORKS;

    const result = this.sortedCurrencies.filter((currency) => {
      const walletBalance = currency.balances.map(({ name }) => name);
      const isAvailableInSelectedNetwork = walletBalance.includes(this.selectedNetwork);

      if (!isAllNetworks && !isAvailableInSelectedNetwork) return false;

      return currency.name.includes(filter);
    });

    if (!this.isCustomSort(this.selectedWallet.address)) {
      const network = isAllNetworks ? undefined : this.selectedNetwork;

      return defaultSortingCurrencies(result, this.selectedWallet, network);
    }

    return result;
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

  setCustomSort() {
    this.setCustomSorting(this.selectedWallet.address);
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
    this.showSelectNetworkPopup = false;
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible(allCurrenciesHidden: boolean) {
    // if (allCurrenciesHidden) {
    //   this.currencies.forEach((currency) => currency.setCurrencyVisibility(this.selectedWallet.address, true));
    //   return;
    // }
    // this.currencies.forEach((currency) => {
    //   const isZeroBalance = currency.getTotalCountAssets(this.selectedWallet) === '0';
    //   if (isZeroBalance) currency.setCurrencyVisibility(this.selectedWallet.address, false);
    // });
    // const currenciesVisibleWithBalance = this.currencies.filter(
    //   (currency) =>
    //     currency.getCurrencyVisibility(this.selectedWallet.address) &&
    //     currency.getTotalCountAssets(this.selectedWallet, this.selectedNetwork) !== '0'
    // );
    // const currenciesInvisibleWithBalance = this.currencies.filter(
    //   (currency) =>
    //     !currency.getCurrencyVisibility(this.selectedWallet.address) &&
    //     currency.getTotalCountAssets(this.selectedWallet, this.selectedNetwork) !== '0'
    // );
    // const currenciesInvisibleWithoutBalance = this.currencies.filter(
    //   (currency) =>
    //     !currency.getCurrencyVisibility(this.selectedWallet.address) &&
    //     currency.getTotalCountAssets(this.selectedWallet, this.selectedNetwork) === '0'
    // );
    // this.setCurrencies({
    //   currencies: [
    //     ...currenciesVisibleWithBalance,
    //     ...currenciesInvisibleWithBalance,
    //     ...currenciesInvisibleWithoutBalance,
    //   ],
    //   address: this.selectedWallet.address,
    //   network: this.selectedNetwork,
    // });
    // this.currenciesKey += 1;
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

    // const prepNetwork = network === 'all' ? null : `0x${this.getNetwork(network).chainId}`;

    this.setSelectedNetwork({ network });
    // tieAccount(this.selectedWallet.address, prepNetwork);
    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

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
