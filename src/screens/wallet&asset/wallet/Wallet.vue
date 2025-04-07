<template>
  <div class="wallet">
    <header class="wallet-header">
      <WalletBalance
        class="wallet-balance"
        :balance="summaryWalletBalance"
        :changeWalletBalance="changeWalletBalance"
        :staticWidth="false"
        @click.native="$emit('openFiatsPopup', true)"
      />

      <Loading v-if="showLoadingBalance" :width="28" class="balance-loading" />
    </header>

    <ContentForm :height="contentFormHeight">
      <div class="content">
        <WalletSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
          :tokenGroups="filteredTokenGroups"
          @update:filterValue="updateFilterValue"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementForm"
          @toggleCurrenciesVisible="toggleCurrenciesVisible"
        />

        <router-view
          :balances="filteredTokenGroups"
          :showAssetsManagementForm="showAssetsManagementForm"
          :filterValue="filterValue"
          @toggleNetworkManagementVisible="toggleNetworkManagementVisible"
          @toggleAssetsManagementForm="toggleAssetsManagementForm"
        />
      </div>
    </ContentForm>

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
import { NETWORK_STATUS } from '@extension-base/api/types/networks';
import type { BalanceItem } from '@extension-base/api/evm/types';
import type { TabWallet } from '@/interfaces';
import WalletSettings from '@/screens/wallet&asset/wallet/WalletSettings.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import SendForm from '@/screens/wallet&asset/SendForm.vue';
import { accountController } from '@/controllers/accountController';
import WalletBalance from '@/screens/main/WalletBalance.vue';
import NetworkManagement from '@/screens/wallet&asset/wallet/NetworkManagement.vue';
import NetworkUnavailablePopup from '@/screens/wallet&asset/wallet/NetworkUnavailablePopup.vue';
import GoogleExportPopup from '@/screens/wallet&asset/wallet/GoogleExportPopup.vue';
import { ALL_NETWORKS } from '@/consts/networks';
import { defaultSortingCurrencies, filterBalanceItemsByNetwork } from '@/helpers/currencies';
import { getChangeWalletBalance, getSummaryWalletBalance, isNetworkGroup } from '@/helpers/common';
import { CONTENT_FORM_HEIGHT } from '@/consts/global';
import { networksIsPending } from '@/helpers/shimmers';
import BaseApi from '@/util/BaseApi';
import { fetchEvmBalance } from '@/extension/messaging';
import { isSameString } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { MENU_HEIGHT } from '@/screens/main/Menu.vue';

@Component({
  components: {
    SendForm,
    ReceiveForm,
    WalletBalance,
    WalletSettings,
    NetworkManagement,
    NetworkUnavailablePopup,
    GoogleExportPopup,
  },
})
export default class Wallet extends Vue {
  networksStore = useNetworksStore();
  showNetworkManagement = false;
  showAssetsManagementForm = false;
  networkUnavailable = '';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };

  accountsStore = useAccountsStore();

  get activeTabName() {
    return this.$route.name;
  }

  get contentFormHeight() {
    const isTonWallet = this.accountsStore.selectedWallet.isTon;

    return isTonWallet ? CONTENT_FORM_HEIGHT + MENU_HEIGHT : CONTENT_FORM_HEIGHT;
  }

  get showNetworkUnavailablePopup() {
    return this.networkUnavailable !== '';
  }

  get showWarningIcon() {
    if (this.accountsStore.selectedNetwork !== ALL_NETWORKS) {
      const networkStatus = this.networksStore.networks.find(
        ({ name }) => name.toLowerCase() === this.accountsStore.selectedNetwork.toLowerCase()
      )?.networkStatus;

      return networkStatus === NETWORK_STATUS.DISCONNECTED;
    }

    return this.networksWithWarning.length !== 0;
  }

  get disconnectedNetworks() {
    return this.networksStore.networks.filter(({ networkStatus }) => networkStatus === NETWORK_STATUS.DISCONNECTED);
  }

  get networksWithWarning() {
    return this.disconnectedNetworks.filter(({ name }) => !this.accountsStore.getShowWarningNetwork(name));
  }

  get summaryWalletBalance() {
    return getSummaryWalletBalance(
      this.accountsStore.selectedWallet.address,
      this.accountsStore.balances,
      this.networksStore.assetsPrice,
      this.accountsStore.selectedNetwork,
      this.networksStore.networks
    );
  }

  get changeWalletBalance() {
    if (this.accountsStore.balances.length === 0) return { percent: 0, amount: 0 };

    return getChangeWalletBalance(
      this.accountsStore.balances,
      this.networksStore.assetsPrice,
      this.accountsStore.selectedNetwork
    );
  }

  get sortedTokenGroups() {
    const balances = this.accountsStore.selectedWallet.hasEthereum
      ? this.accountsStore.balances
      : this.accountsStore.balances.filter((el) => !BaseApi.isEthereumNetwork(el.mainNetwork));

    const { address } = this.accountsStore.selectedWallet;

    if (address === '') return [];

    if (!this.accountsStore.isCustomSort(address))
      return defaultSortingCurrencies(
        this.accountsStore.balances,
        this.networksStore.assetsPrice,
        this.accountsStore.selectedNetwork
      );

    const sequence = accountController.getSequenceAssetsByAddress(address);

    return balances.sort((currency1, currency2) => {
      const index1 = sequence.indexOf(currency1.groupId);
      const index2 = sequence.indexOf(currency2.groupId);

      return index1 - index2;
    });
  }

  get showShimmers() {
    return networksIsPending(this.networksStore.networks, this.accountsStore.selectedNetwork);
  }

  get showLoadingBalance() {
    if (!isNetworkGroup(this.accountsStore.selectedNetwork)) {
      const networkStatus = this.networksStore.networks.find(
        ({ name }) => name.toLowerCase() === this.accountsStore.selectedNetwork.toLowerCase()
      )?.networkStatus;

      return networkStatus === NETWORK_STATUS.CONNECTING;
    }

    //TODO добавить проверку по группам
    const isPendingExists = this.networksStore.networks.some(
      ({ networkStatus }) => networkStatus === NETWORK_STATUS.CONNECTING
    );

    return !navigator.onLine || isPendingExists;
  }

  get filteredTokenGroups() {
    const isAllNetworks = isSameString(this.accountsStore.selectedNetwork, ALL_NETWORKS);

    const tokenGroups = this.accountsStore.selectedWallet.isMobile
      ? this.sortedTokenGroups.filter(({ balances }) => {
          return balances.some((balance) => {
            const account = this.accountsStore.accounts.find(
              ({ address }) => address === this.accountsStore.selectedWallet.address
            );

            const network = this.networksStore.getNetwork(balance.name);

            return account?.chains?.some((el) => network.chainId.includes(el));
          });
        })
      : this.sortedTokenGroups;

    const filteredByNetwork = isAllNetworks
      ? tokenGroups
      : tokenGroups.filter(({ balances }) => {
          return balances.some((balance) => filterBalanceItemsByNetwork(balance, this.accountsStore.selectedNetwork));
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

  @Watch('selectedWallet')
  updateEvmBalance() {
    fetchEvmBalance(undefined, this.accountsStore.selectedWallet.ethereumAddress);
  }

  activated() {
    fetchEvmBalance(undefined, this.accountsStore.selectedWallet.ethereumAddress);
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

  toggleAssetsManagementForm(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible(allCurrenciesHidden: boolean) {
    if (allCurrenciesHidden) {
      this.accountsStore.balances.forEach(({ groupId }) =>
        this.accountsStore.setHiddenAssets({ groupId, value: true })
      );

      return;
    }

    const nonZeroBalanceCb = ({ transferable }: BalanceItem) => transferable && +transferable > 0;

    this.accountsStore.balances.forEach(({ groupId, balances }) => {
      const index = balances.findIndex(nonZeroBalanceCb);
      const isZeroBalance = index === -1;

      if (isZeroBalance) this.accountsStore.setHiddenAssets({ groupId, value: false });
    });

    const assetsVisibleWithBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
      const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
      const isVisibleAsset = !this.accountsStore.hiddenAssets.includes(groupId);

      return isVisibleAsset && haveAssets;
    });

    const assetsInvisibleWithBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
      const haveAssets = balances.findIndex(nonZeroBalanceCb) !== -1;
      const isHiddenAsset = this.accountsStore.hiddenAssets.includes(groupId);

      return isHiddenAsset && haveAssets;
    });

    const assetsInvisibleWithoutBalance = this.accountsStore.balances.filter(({ balances, groupId }) => {
      const notHaveAssets = balances.findIndex(nonZeroBalanceCb) === -1;
      const isHiddenAsset = this.accountsStore.hiddenAssets.includes(groupId);

      return isHiddenAsset && notHaveAssets;
    });

    this.accountsStore.setBalance({
      details: [...assetsVisibleWithBalance, ...assetsInvisibleWithBalance, ...assetsInvisibleWithoutBalance],
      reset: false,
      saveSequence: true,
    });
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
    font-size: 1.375em;
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
