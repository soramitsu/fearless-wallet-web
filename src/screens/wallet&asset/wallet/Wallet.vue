<template>
  <div class="wallet">
    <header class="wallet-header">
      <Shimmer v-if="showShimmers" height="46px" width="150px" />

      <div v-else class="wallet-balance" @click="$emit('openFiatsPopup', true)">
        {{ fiatSymbol }} {{ totalBalance }}
      </div>

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopupVisible"
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

        <Scroll>
          <Currencies
            v-if="showCurrencies"
            :key="currenciesKey"
            :currencies="filteredCurrencies"
            :selectedNetwork="selectedNetwork"
            :showAssetsManagementForm="showAssetsManagementForm"
            :toggleVisibleActivityForm="toggleVisibleActivityForm"
          />

          <NFTs v-else-if="showNfts" />
        </Scroll>
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
      :_selectedNetwork="selectedNetwork"
      :selectedAssetId="selectedCurrency.assetId"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)"
    />

    <Tooltip text="wallet.walletBalance" target=".wallet-balance" placement="right" />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import SendForm from '../SendForm.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import SelectNetworkPopup from '../SelectNetworkPopup.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import NFTs from './NFTs.vue';
import type { Currencies as TCurrencies, Currency } from '@/interfaces/currencies';
import type { TMutation, TabWallet } from '@/interfaces/common';
import type { SetSelectedNetworkProps } from '@/store/accounts/types';
import Scroll from '@/components/Scroll.vue';
import ContentForm from '@/components/ContentForm.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { SetCurrenciesProps } from '@/store/networks/types';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { addNumbers, formattedNumber } from '@/helpers/numbers';
import Tooltip from '@/components/Tooltip.vue';
import Shimmer from '@/components/Shimmer.vue';

@Component({
  components: {
    NFTs,
    Scroll,
    Tooltip,
    Shimmer,
    SendForm,
    Currencies,
    ContentForm,
    ReceiveForm,
    ContentSettings,
    SelectNetworkPopup,
    SelectNetworkButton,
  },
})
export default class Wallet extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  showAssetsManagementForm = false;
  showSendForm = false;
  showReceiveForm = false;
  showSelectNetworkPopup = false;
  currenciesKey = 0;
  activeTabName: TabWallet = 'Currencies';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork?: string;
    assetId?: string;
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: TCurrencies;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(NetworksGettersTypes.getAllNetworksIsReady) allNetworksIsReady!: boolean;
  @Getter(AccountsGettersTypes.getOnlineStatus) isOnline!: boolean;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;
  @Mutation(AccountsMutationTypes.SET_SELECTED_NETWORK) setSelectedNetwork!: TMutation<SetSelectedNetworkProps>;

  get showShimmers() {
    // TODO: подумать над тем, чтобы добавить лоадер на весь экстеншен, пока не загружены JSON файлы
    if (this.currencies.length === 0) return true; // удалить если добавим лоадер

    return !this.isOnline || !this.allNetworksIsReady;
  }

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    const sequence = accountController.getSequenceAssetsByAddress(address);

    return this.currencies.sort((currency1, currency2) => {
      const { assetId: assetId1 } = currency1;
      const { assetId: assetId2 } = currency2;
      const index1 = sequence.indexOf(assetId1);
      const index2 = sequence.indexOf(assetId2);

      return index1 - index2;
    });
  }

  get filteredCurrencies() {
    if (this.showAssetsManagementForm) return this.sortedCurrencies;

    const filter = this.filterValue.trim().toLowerCase();

    return this.sortedCurrencies.filter((currency) => {
      const isAllNetworks = this.selectedNetwork === 'all';
      const availableInNetworks = currency.getAvailableInNetworks(this.selectedWallet).map(({ network }) => network);
      const isAvailableInSelectedNetwork = availableInNetworks.includes(this.selectedNetwork);

      // if a network is selected and there is no currency in this network
      if (!isAllNetworks && !isAvailableInSelectedNetwork) return false;

      const { displayName, mainNetwork } = currency;

      return (
        availableInNetworks.join(' ').includes(filter) || displayName.includes(filter) || mainNetwork.includes(filter)
      );
    });
  }

  get totalBalance() {
    const arr = this.sortedCurrencies.map((currency) => currency.getTotalBalance(this.selectedWallet));

    return formattedNumber(+addNumbers(arr), { returnOriginNumber: false });
  }

  get totalPercent() {
    return 5.3;
  }

  get showCurrencies() {
    return this.activeTabName === 'Currencies';
  }

  get showNfts() {
    return this.activeTabName === 'NFTs';
  }

  deactivated() {
    this.showAssetsManagementForm = false;
    this.filterValue = '';
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible(allCurrenciesHidden: boolean) {
    if (allCurrenciesHidden) {
      this.currencies.forEach((currency) => currency.setCurrencyVisible(this.selectedWallet.address, true));

      return;
    }

    this.currencies.forEach((currency) => {
      const isZeroBalance = currency.getTotalCountAssets(this.selectedWallet) === '0';

      if (isZeroBalance) currency.setCurrencyVisible(this.selectedWallet.address, false);
    });

    const currenciesVisibleWithBalance = this.currencies.filter(
      (currency) =>
        currency.getCurrencyVisible(this.selectedWallet.address) &&
        currency.getTotalCountAssets(this.selectedWallet) !== '0'
    );
    const currenciesInvisibleWithBalance = this.currencies.filter(
      (currency) =>
        !currency.getCurrencyVisible(this.selectedWallet.address) &&
        currency.getTotalCountAssets(this.selectedWallet) !== '0'
    );
    const currenciesInvisibleWithoutBalance = this.currencies.filter(
      (currency) =>
        !currency.getCurrencyVisible(this.selectedWallet.address) &&
        currency.getTotalCountAssets(this.selectedWallet) === '0'
    );

    this.setCurrencies({
      currencies: [
        ...currenciesVisibleWithBalance,
        ...currenciesInvisibleWithBalance,
        ...currenciesInvisibleWithoutBalance,
      ],
      address: this.selectedWallet.address,
    });

    this.currenciesKey += 1;
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true, currency: Currency) {
    this[field] = value;

    this.selectedCurrency = value
      ? {
          mainNetwork: currency.mainNetwork,
          assetId: currency.assetId,
        }
      : {};
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.setSelectedNetwork({ network });
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

  .wallet-balance {
    margin: auto 0;
    font-weight: 800;
    font-size: 22px;
    line-height: 28px;
    min-width: 75px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      cursor: pointer;
    }
  }
}
</style>
