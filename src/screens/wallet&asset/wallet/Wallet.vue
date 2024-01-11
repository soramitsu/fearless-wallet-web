<template>
  <div class="wallet">
    <header class="wallet-header">
      <WalletBalance
        class="wallet-balance"
        :balance="summaryTransferableBalance"
        :changeWalletBalance="changeWalletBalance"
        :staticWidth="false"
        @click.native="$emit('openFiatsPopup', true)"
      />

      <Loading v-if="showLoadingBalance" :width="28" class="balance-loading" />
    </header>

    <SoraCardBanner />

    <ContentForm :height="contentFormHeight">
      <div class="content">
        <WalletSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :balances="filteredCurrencies"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementFormVisible"
          @toggleCurrenciesVisible="toggleCurrenciesVisible"
        />

        <router-view
          :isEmptyBalances="isEmptyBalances"
          :balances="filteredCurrencies"
          :showAssetsManagementForm="showAssetsManagementForm"
          :filterValue="filterValue"
          @toggleVisibleActivityForm="toggleVisibleActivityForm"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
        />
      </div>
    </ContentForm>

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :_selectedAssetId="selectedCurrency.assetId"
      @closeForm="toggleVisibleActivityForm('showSendForm', {}, false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :selectedAssetId="selectedCurrency.assetId"
      @closeForm="toggleVisibleActivityForm('showReceiveForm', {}, false)"
    />

    <NetworkManagement
      v-if="showNetworkManagement"
      :networks="networksWithWarning"
      @closeForm="toggleNetworkManagementVisible"
      @setNetworkUnavailable="setNetworkUnavailable"
    />

    <NetworkUnavailablePopup
      v-if="showNetworkUnavailablePopup"
      :networks="networksWithWarning"
      :network="networkUnavailable"
      @closePopup="setNetworkUnavailable"
    />

    <GoogleExportPopup v-if="showGoogleExportPopup" @closePopup="closeGoogleExportPopup" />

    <Tooltip text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Getter, Mutation, Action } from 'vuex-class';
import { type AccountJson, type BalanceJson, type TokenBalance } from '@extension-base/background/types/types';
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { NetworkJson } from '@extension-base/types';
import type { SelectedWallet, GetShowWarningNetworks, SetHiddenAsset, GetNetwork } from '@/store';
import type { AsyncFn, Fn, TabWallet, AssetsPrice } from '@/interfaces';
import type { BalanceItem } from '@extension-base/api/evm/types/ether';
import Currencies from '@/screens/wallet&asset/wallet/Currencies.vue';
import WalletSettings from '@/screens/wallet&asset/wallet/WalletSettings.vue';
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
import { defaultSortingCurrencies, filterBalanceItemsByNetwork } from '@/helpers/currencies';
import { getChangeWalletBalance, getSummaryTransferableWalletBalance, isNetworkGroup } from '@/helpers/common';
import { SORA_CARD_BANNER_HEIGHT } from '@/consts/soraCard';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import SoraCardBanner from '@/screens/soraCard/SoraCardBanner.vue';
import { networksIsPending } from '@/helpers/shimmers';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { isSameString } from '@/helpers';

@Component({
  components: {
    SendForm,
    Currencies,
    ReceiveForm,
    WalletBalance,
    SoraCardBanner,
    WalletSettings,
    NetworkManagement,
    NetworkUnavailablePopup,
    GoogleExportPopup,
  },
})
export default class Wallet extends Vue {
  showNetworkManagement = false;
  showAssetsManagementForm = false;
  showSendForm = false;
  showReceiveForm = false;
  networkUnavailable = '';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getAccounts) accounts!: AccountJson[];
  @Getter(AccountsGettersTypes.getShowWarningNetwork) getShowWarningNetwork!: GetShowWarningNetworks;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getIsCustomSort) isCustomSort!: (address: string) => boolean;
  @Getter(AccountsGettersTypes.selectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.showSoraCardBanner) showSoraCardBanner!: boolean;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.prices) prices!: AssetsPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: GetNetwork;
  @Getter(NetworksGettersTypes.getNetworkGenesisHash) getGenesisHashByNetwork!: (value: string) => string;
  @Getter(AccountsGettersTypes.hiddenAssets) hiddenAssets!: string[];
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: Fn<string>;
  @Mutation(AccountsMutationTypes.SET_HIDDEN_ASSET) setHiddenAssets!: Fn<SetHiddenAsset>;
  @Action(AccountsActionTypes.SET_BALANCE) setBalance!: AsyncFn<BalanceJson>;

  get activeTabName() {
    return this.$route.name;
  }

  get contentFormHeight() {
    const subtractionNumber = this.showSoraCardBanner ? SORA_CARD_BANNER_HEIGHT : 0;

    return CONTENT_FORM_HEIGHT - subtractionNumber;
  }

  get showNetworkUnavailablePopup() {
    return this.networkUnavailable !== '';
  }

  get isEmptyBalances() {
    return this.balances.length === 0;
  }

  get showWarningIcon() {
    if (this.selectedNetwork !== ALL_NETWORKS) {
      const networkStatus = this.networks.find(
        ({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()
      )?.networkStatus;

      return networkStatus === NETWORK_STATUS.DISCONNECTED;
    }

    return this.networksWithWarning.length !== 0;
  }

  get disconnectedNetworks() {
    return this.networks.filter(({ networkStatus }) => networkStatus === NETWORK_STATUS.DISCONNECTED);
  }

  get networksWithWarning() {
    return this.disconnectedNetworks.filter(({ name }) => !this.getShowWarningNetwork(name));
  }

  get summaryTransferableBalance() {
    return getSummaryTransferableWalletBalance(
      this.selectedWallet.address,
      this.balances,
      this.prices,
      this.selectedNetwork,
      this.networks
    );
  }

  get changeWalletBalance() {
    if (this.balances.length === 0) return { percent: 0, amount: 0 };

    return getChangeWalletBalance(this.balances, this.prices, this.selectedNetwork);
  }

  get sortedCurrencies() {
    const balances =
      this.selectedWallet.ethereumAddress === ''
        ? this.balances.filter((el) => !BaseApi.isEthereumNetwork(el.mainNetwork))
        : this.balances;

    const { address } = this.selectedWallet;

    if (address === '') return [];

    if (!this.isCustomSort(address)) return defaultSortingCurrencies(this.balances, this.prices, this.selectedNetwork);

    const sequence = accountController.getSequenceAssetsByAddress(address);

    return balances.sort((currency1, currency2) => {
      const index1 = sequence.indexOf(currency1.assetId);
      const index2 = sequence.indexOf(currency2.assetId);

      return index1 - index2;
    });
  }

  get showShimmers() {
    return networksIsPending(this.networks, this.selectedNetwork);
  }

  get showLoadingBalance() {
    if (!isNetworkGroup(this.selectedNetwork)) {
      const networkStatus = this.networks.find(
        ({ name }) => name.toLowerCase() === this.selectedNetwork.toLowerCase()
      )?.networkStatus;

      return networkStatus === NETWORK_STATUS.CONNECTING;
    }

    //TODO добавить проверку по группам
    const isPendingExists = this.networks.some(({ networkStatus }) => networkStatus === NETWORK_STATUS.CONNECTING);

    return !navigator.onLine || isPendingExists;
  }

  get filteredCurrencies() {
    const isAllNetworks = isSameString(this.selectedNetwork, ALL_NETWORKS);

    const currencies = this.selectedWallet.isMobile
      ? this.sortedCurrencies.filter(({ balances }) => {
          return balances.some((balance) => {
            const account = this.accounts.find(({ address }) => address === this.selectedWallet.address);
            const network = this.getNetwork(balance.name);

            if (account && account.chains) {
              if (!account.chains.some((el) => network.chainId.includes(el))) return false;

              return true;
            }

            return false;
          });
        })
      : this.sortedCurrencies;

    const filteredByNetwork = isAllNetworks
      ? currencies
      : currencies.filter(({ balances }) => {
          return balances.some((balance) => filterBalanceItemsByNetwork(balance, this.selectedNetwork));
        });

    if (this.showAssetsManagementForm) return filteredByNetwork;

    const filter = this.filterValue.trim().toLowerCase();

    return filteredByNetwork.filter(({ symbol }) => symbol.toLowerCase().includes(filter));
  }

  get showCurrencies() {
    return this.activeTabName === 'currencies';
  }

  get showGoogleExportPopup() {
    return this.$route.params.access_token && this.$route.params.access_token !== 'null';
  }

  @Watch('networksWithWarning')
  connect(value: string[]) {
    if (value.length === 0) this.showNetworkManagement = false;
  }

  activated() {
    fetchEvmBalance();
  }

  deactivated() {
    this.showAssetsManagementForm = false;
    this.showNetworkManagement = false;
    this.filterValue = '';

    this.setNetworkUnavailable();
  }

  closeGoogleExportPopup() {
    this.$router.replace('/').catch((e) => e);

    this.$emit('closeSelectWalletPopup');
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

    const nonZeroBalanceCb = ({ transferable }: BalanceItem) => transferable && +transferable > 0;

    this.balances.forEach(({ assetId, balances }) => {
      const index = balances.findIndex(nonZeroBalanceCb);
      const isZeroBalance = index === -1;

      if (isZeroBalance) this.setHiddenAssets({ assetId, value: false });
    });

    const assetsVisibleWithBalance = this.balances.filter(({ balances, assetId }) => {
      const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
      const isVisibleAsset = !this.hiddenAssets.includes(assetId);

      return isVisibleAsset && haveAssets;
    });

    const assetsInvisibleWithBalance = this.balances.filter(({ balances, assetId }) => {
      const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
      const isHiddenAsset = this.hiddenAssets.includes(assetId);

      return isHiddenAsset && haveAssets;
    });

    const assetsInvisibleWithoutBalance = this.balances.filter(({ balances, assetId }) => {
      const notHaveAssets = balances.findIndex(nonZeroBalanceCb) === -1;
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
    currency: { mainNetwork?: string; assetId?: string },
    value = true
  ) {
    this.selectedCurrency = currency;
    this[field] = value;

    if (!isNetworkGroup(this.selectedNetwork)) this.selectedCurrency.mainNetwork = this.selectedNetwork;
  }

  updateFilterValue(value: string) {
    this.filterValue = value;
  }

  updateActiveTabName(name: TabWallet) {
    if (this.activeTabName === name) return;

    this.$router.push({ name });
  }
}
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;

  .content {
    padding: $default-padding 0 $default-padding $default-padding;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .wallet-header {
    min-height: 46px;
    display: flex;
    margin-bottom: 10px;
  }

  .balance-loading {
    margin-left: 10px;
  }

  .wallet-balance {
    font-size: 22px;
    line-height: 28px;
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
