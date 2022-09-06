<template>
  <div class="wallet">
    <header class="wallet-header">
      <div class="wallet-balance" @click="$emit('openFiatsPopup', true)">{{ fiatSymbol }} {{ totalBalance }}</div>

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopupVisible"
      />
    </header>

    <SelectPopup
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      horizontalPlacement="right"
      verticalPlacement="center"
      sizeWidth="big"
      placeholder="Search in networks"
      :top="25"
      :showIcon="true"
      :showSearch="true"
      :showBorder="true"
      :staticHeight="true"
      :options="filteredOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter.bind(null, 'popupFilterValue')"
    />

    <ContentForm :height="394">
      <div class="content">
        <ContentSettings
          :activeTabName="activeTabName"
          :showAssetsManagementForm="showAssetsManagementForm"
          :hideZeroBalance="hideZeroBalance"
          :handlerFilter="handlerFilter.bind(null, 'filterValue')"
          @update:activeTabName="updateActiveTabName"
          @update:showAssetsManagementForm="toggleAssetsManagementFormVisible"
          @update:hideZeroBalance="toggleCurrenciesVisible"
        />

        <Scroll>
          <Currencies
            v-if="showCurrencies"
            :key="hideZeroBalance"
            :currencies="filteredCurrencies"
            :selectedNetwork="selectedNetwork"
            :showAssetsManagementForm="showAssetsManagementForm"
            :hideZeroBalance="hideZeroBalance"
            :toggleVisibleActivityForm="toggleVisibleActivityForm"
            @toggleHideZeroBalance="toggleHideZeroBalance"
          />

          <NFTs v-else-if="showNfts" />
        </Scroll>
      </div>
    </ContentForm>

    <SendForm
      v-if="showSendForm"
      :_selectedToken="selectedCurrency.token"
      :_selectedNetwork="selectedCurrency.mainNetwork"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="selectedCurrency.mainNetwork"
      :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import SelectNetworkButton from './SelectNetworkButton.vue';
import ReceiveForm from './ReceiveForm.vue';
import SendForm from './SendForm.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import NFTs from './NFTs.vue';
import type { Currencies as TCurrencies, Currency } from '@/interfaces/currencies';
import type { TMutation, TabWallet } from '@/interfaces/common';
import Scroll from '@/components/Scroll.vue';
import ContentForm from '@/components/ContentForm.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks, SetCurrenciesProps } from '@/store/networks/types';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/helpers';
import { addNumbers, formattedNumber } from '@/util/numbers';
@Component({
  components: {
    NFTs,
    Scroll,
    SendForm,
    Currencies,
    ContentForm,
    ReceiveForm,
    SelectPopup,
    ContentSettings,
    SelectNetworkButton,
  },
})
export default class Wallet extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  showAssetsManagementForm = false;
  hideZeroBalance = false;
  showSendForm = false;
  showReceiveForm = false;
  showSelectNetworkPopup = false;
  selectedNetwork = 'All networks';
  activeTabName: TabWallet = 'Currencies';
  popupFilterValue = '';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork: string;
    token: string;
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: TCurrencies;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    const sequence = accountController.getSequenceTokens(address) as string[];

    return this.currencies.sort(({ token: token1 }, { token: token2 }) => {
      const index1 = sequence.indexOf(token1);
      const index2 = sequence.indexOf(token2);

      return index1 - index2;
    });
  }

  get filteredCurrencies() {
    if (this.showAssetsManagementForm) return this.sortedCurrencies;

    const filter = this.filterValue.trim().toLowerCase();

    return this.sortedCurrencies.filter((currency) => {
      const isAllNetworks = this.selectedNetwork === 'All networks';
      const availableInSelectedNetwork = isAllNetworks
        ? false
        : currency
            .getAvailableInNetworks(this.selectedWallet)
            .map(({ network }) => network)
            .includes(this.selectedNetwork);

      // if a network is selected and there is no currency in this network
      if (!isAllNetworks && !availableInSelectedNetwork) return false;

      const { mainNetwork, token } = currency;

      return mainNetwork.includes(filter) || token.includes(filter);
    });
  }

  get totalBalance() {
    const arr = this.sortedCurrencies.map((currency) => currency.getTotalBalance(this.selectedWallet));

    return formattedNumber(+addNumbers(arr));
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

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: 'globus.svg', isAll: true },
      ...this.networks.map(({ name }) => {
        return { label: firstCharToUp(name), value: name, path: `networks/${getImgPathByNetworkName(name)}` };
      }),
    ];
  }

  get filteredOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
  }

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible(value: boolean) {
    if (value) {
      this.currencies.forEach((currency) => {
        const isZeroBalance = currency.getTotalCountTokens(this.selectedWallet) === '0';

        if (isZeroBalance) currency.setCurrencyVisible(false);
      });
    }

    this.toggleHideZeroBalance();
  }

  toggleHideZeroBalance() {
    const findIndex = this.currencies.findIndex((currency) => {
      const visible = currency.getCurrencyVisible();

      return currency.getTotalCountTokens(this.selectedWallet) === '0' && visible;
    });

    this.hideZeroBalance = findIndex === -1;
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true, currency: Currency) {
    this[field] = value;

    if (currency)
      this.selectedCurrency = {
        mainNetwork: currency.mainNetwork,
        token: currency.token,
      };
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;
    this.toggleSelectNetworkPopupVisible();
    this.handlerFilter('popupFilterValue', '');
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
  }

  handlerFilter(field: 'popupFilterValue' | 'filterValue', value: string) {
    this[field] = value;
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
  width: 100%;
  height: 450px;

  .content {
    padding: $default-padding 0 0 $default-padding;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .wallet-header {
    height: 46px;
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
