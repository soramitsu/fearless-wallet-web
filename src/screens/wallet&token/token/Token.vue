<template>
  <div class="token">
    <div class="token-header">
      <div class="descriptions">
        <div class="count-tokens">{{ countTokensString }}</div>
        <div class="balance-in-network">{{ balanceInNetworkString }}</div>
        <div class="price">{{ tokenPriceString }}</div>
      </div>

      <SelectNetworkButton
        :ref="selectNetworkButtonRef"
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopupVisible"
      />
    </div>

    <div class="activity">
      <BorderButton class="activity-button" text="Send" iconName="send" @click="toggleVisible('showSendForm', true)" />

      <BorderButton
        class="activity-button"
        text="Receive"
        iconName="receive"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        class="activity-button"
        text="Teleport"
        iconName="teleport"
        @click="toggleVisible('showTeleportForm', true)"
      />

      <BorderButton
        v-if="showBuyButton"
        class="activity-button"
        text="Buy"
        iconName="plus-pink"
        @click="toggleVisible('showBuyPopup', true)"
      />
    </div>

    <ContentForm :height="306">
      <div class="content">
        <div class="content-settings">
          <div class="history-label">History</div>

          <Corners>
            <Dropdown
              :value="filterHistoryValue"
              :options="historyDropdownOption"
              :handler="filterHistoryValueUpdate"
            />
          </Corners>
        </div>

        <Scroll>
          <History :history="formattedHistory" :token="selectedToken" :filterHistoryValue="filterHistoryValue" />
        </Scroll>
      </div>
    </ContentForm>

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedNetwork"
      :_selectedToken="selectedToken"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :selectedNetwork="selectedNetwork"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <TeleportForm
      v-if="showTeleportForm"
      :_originalNetwork="selectedNetwork"
      :_selectedToken="selectedToken"
      :closeForm="toggleVisible.bind(null, 'showTeleportForm', false)"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :token="selectedToken"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <SelectPopup
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      horizontalPlacement="right"
      verticalPlacement="center"
      placeholder="Search in networks"
      :top="25"
      :showBorder="true"
      :showIcon="true"
      :showSearch="true"
      :staticHeight="true"
      :options="filterOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter"
    />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SendForm from '../SendForm.vue';
import TeleportForm from '../TeleportForm.vue';
import BuyPopup from '../BuyPopup.vue';
import History from './History.vue';
import type { FilterHistory } from '@/interfaces/common';
import type { History as THistory } from '@/interfaces/history';
import BorderButton from '@/components/BorderButton.vue';
import Scroll from '@/components/Scroll.vue';
import Corners from '@/components/Corners.vue';
import Dropdown from '@/components/Dropdown.vue';
import ContentForm from '@/components/ContentForm.vue';
import TabButton from '@/components/TabButton.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import BaseApi from '@/util/BaseApi';
import { Currencies } from '@/interfaces/currencies';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks as NetworksType } from '@/store/networks/types';
import { Components } from '@/router/routes';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber, formattedPrice } from '@/util/numbers';

@Component({
  components: {
    Scroll,
    Corners,
    History,
    SendForm,
    BuyPopup,
    Dropdown,
    TabButton,
    ReceiveForm,
    SelectPopup,
    ContentForm,
    TeleportForm,
    BorderButton,
    SelectNetworkButton,
  },
})
export default class Token extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';
  readonly historyDropdownOption = [
    { label: 'All', value: 'all' },
    { label: 'Transfer', value: 'transfer' },
    { label: 'Reward', value: 'reward' },
    { label: 'Extrinsic', value: 'extrinsic' },
  ];

  filterHistoryValue = 'all';
  popupFilterValue = '';
  showSendForm = false;
  showReceiveForm = false;
  showTeleportForm = false;
  showBuyPopup = false;
  showSelectNetworkPopup = false;

  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworksType;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getHistory) history!: THistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

  get providers() {
    return this.currentCurrency?.providers ?? [];
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.currentCurrency?.mainNetwork === this.selectedNetwork;
  }

  get optionsNetworks() {
    return this.networks.map(({ name }) => ({
      label: firstCharToUp(name),
      value: name,
      path: `networks/${getImgPathByNetworkName(name)}`,
    }));
  }

  get filterOptionsNetworks() {
    const filter = this.popupFilterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
  }

  get currentCurrency() {
    return this.currencies.find(({ token }) => token === this.selectedToken);
  }

  get displayAddressByNetwork() {
    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get formattedHistory() {
    const addressByNetwork = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.selectedNetwork
    );
    const historyForNetwork = this.history[this.selectedNetwork];
    const historyForWalletAddress = historyForNetwork?.[addressByNetwork]?.nodes ?? [];

    const index = (this.currentCurrency?.balances[addressByNetwork] ?? []).findIndex(
      ({ network }) => network === this.selectedNetwork
    );

    // TODO: fix
    // Now the history hierarchy is as follows = network: { walletAddress: { history } }
    // should become like this = network: { walletAddress: { token: { history } } }
    // when non-native tokens are added, it needs to be fixed
    if (index === -1) {
      return [];
    }

    return historyForWalletAddress;
  }

  get tokenPriceString() {
    return `1 ${this.selectedToken.toUpperCase()} = ${this.fiatSymbol}${formattedPrice(this.price ?? 0)}`;
  }

  get selectedNetwork() {
    return this.$route.params.network;
  }

  get selectedToken() {
    return this.$route.params.token;
  }

  get price() {
    return this.currentCurrency?.price;
  }

  get countTokensString() {
    if (!this.currentCurrency) return `${this.selectedToken.toUpperCase()} 0`;

    const totalCountTokens = +this.currentCurrency.getTotalCountTokensByNetwork(
      this.selectedWallet,
      this.selectedNetwork
    );
    const total = formattedNumber(totalCountTokens, 4);

    return `${this.selectedToken.toUpperCase()} ${+total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrency) return `$ 0`;

    const total = this.currentCurrency.getBalanceInNetwork(this.selectedWallet, this.selectedNetwork);

    return `${this.fiatSymbol} ${formattedNumber(+total)}`;
  }

  handlerFilter(value: string) {
    this.popupFilterValue = value;
  }

  toggleSelectedNetwork(network: string) {
    if (this.selectedNetwork === network) return;

    this.$router.push({
      name: Components.Token,
      params: {
        token: this.selectedToken,
        network: network,
      },
    });

    this.handlerFilter('');
    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    const targetElement = (this.$refs[this.selectNetworkButtonRef] as Vue).$el as HTMLElement;

    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;

    targetElement.style.zIndex = this.showSelectNetworkPopup ? '200' : '0';
  }

  filterHistoryValueUpdate(name: FilterHistory) {
    this.filterHistoryValue = name;
  }

  toggleVisible(field: 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyPopup', value: boolean) {
    this[field] = value;
  }
}
</script>

<style lang="scss" scoped>
.token {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 450px;

  .token-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 16px;

    .descriptions {
      display: flex;
      justify-content: space-between;
      flex-direction: column;
      align-items: flex-start;
      height: 70px;

      .count-tokens {
        font-weight: 600;
        font-size: 28px;
        text-align: left;
        max-width: 265px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .balance-in-network {
        color: rgba(255, 255, 255, 0.5);
      }

      .price {
        color: rgba(255, 255, 255, 0.5);
        font-size: 12px;
        line-height: 15px;
      }
    }
  }

  .activity {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;

    .activity-button {
      flex-grow: 1;
      margin-left: 5px;
      width: 125px;

      &:first-child {
        margin-left: 0;
      }
    }
  }

  .content {
    height: 100%;
    display: flex;
    flex-direction: column;

    .content-settings {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 11px $default-padding 5px 18px;

      .history-label {
        font-weight: 600;
      }
    }
  }
}
</style>
