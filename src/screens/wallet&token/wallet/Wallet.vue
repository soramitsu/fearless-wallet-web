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

    <SelectNetworkPopup
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      :toggleSelectedNetwork="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

    <ContentForm :height="394">
      <div class="content">
        <ContentSettings
          :activeTabName="activeTabName"
          :filterValue="filterValue"
          :showAssetsManagementForm="showAssetsManagementForm"
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
      :_selectedTokenId="selectedCurrency.tokenId"
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
import SendForm from '../SendForm.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import SelectNetworkPopup from '../SelectNetworkPopup.vue';
import ContentSettings from './ContentSettings.vue';
import Currencies from './Currencies.vue';
import NFTs from './NFTs.vue';
import type { Currencies as TCurrencies, Currency } from '@/interfaces/currencies';
import type { TMutation, TabWallet } from '@/interfaces/common';
import Scroll from '@/components/Scroll.vue';
import ContentForm from '@/components/ContentForm.vue';
import { accountController } from '@/controllers/accountController';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { SetCurrenciesProps } from '@/store/networks/types';
import { MutationTypes as NetworksMutationTypes } from '@/store/networks/mutations';
import { addNumbers, formattedNumber } from '@/helpers/numbers';

@Component({
  components: {
    NFTs,
    Scroll,
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
  selectedNetwork = 'All networks';
  activeTabName: TabWallet = 'Currencies';
  filterValue = '';
  selectedCurrency!: {
    mainNetwork: string;
    tokenId: string;
  };

  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: TCurrencies;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;
  @Mutation(NetworksMutationTypes.SET_CURRENCIES) setCurrencies!: TMutation<SetCurrenciesProps>;

  get sortedCurrencies() {
    const { address } = this.selectedWallet;

    if (address === '') return [];

    const sequence = accountController.getSequenceTokensByAddress(address);

    return this.currencies.sort(({ token: token1, relayChain: RC1 }, { token: token2, relayChain: RC2 }) => {
      const index1 = sequence.indexOf(`${token1}-${RC1}`);
      const index2 = sequence.indexOf(`${token2}-${RC2}`);

      return index1 - index2;
    });
  }

  get filteredCurrencies() {
    if (this.showAssetsManagementForm) return this.sortedCurrencies;

    const filter = this.filterValue.trim().toLowerCase();

    return this.sortedCurrencies.filter((currency) => {
      const isAllNetworks = this.selectedNetwork === 'All networks';
      const availableInNetworks = currency.getAvailableInNetworks(this.selectedWallet).map(({ network }) => network);
      const availableInSelectedNetwork = availableInNetworks.includes(this.selectedNetwork);

      // if a network is selected and there is no currency in this network
      if (!isAllNetworks && !availableInSelectedNetwork) return false;

      const { displayName } = currency;

      return availableInNetworks.join(' ').includes(filter) || displayName.includes(filter);
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

  toggleAssetsManagementFormVisible(value = true) {
    this.showAssetsManagementForm = value;
  }

  toggleCurrenciesVisible() {
    this.currencies.forEach((currency) => {
      const isZeroBalance = currency.getTotalCountTokens(this.selectedWallet) === '0';

      if (isZeroBalance) currency.setCurrencyVisible(this.selectedWallet.address, false);
    });

    this.currenciesKey += 1;
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true, currency: Currency) {
    this[field] = value;

    if (currency)
      this.selectedCurrency = {
        mainNetwork: currency.mainNetwork,
        tokenId: currency.tokenId,
      };
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.selectedNetwork = network;
    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
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
