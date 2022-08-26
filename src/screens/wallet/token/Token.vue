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

    <div class="activity-block">
      <BorderButton
        text="Send"
        iconName="send"
        type="secondary"
        width="125px"
        @click="toggleVisible('showSendForm', true)"
      />

      <BorderButton
        text="Receive"
        iconName="receive"
        type="secondary"
        width="125px"
        @click="toggleVisible('showReceiveForm', true)"
      />

      <BorderButton
        text="Teleport"
        iconName="teleport"
        type="secondary"
        width="125px"
        @click="toggleVisible('showTeleportForm', true)"
      />

      <BorderButton
        text="Buy"
        iconName="plus-pink"
        type="secondary"
        width="125px"
        @click="toggleVisible('showBuyForm', true)"
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

    <BuyForm v-if="showBuyForm" :closeForm="toggleVisible.bind(null, 'showBuyForm', false)" />

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
import BorderButton from '@/components/BorderButton.vue';
import Scroll from '@/components/Scroll.vue';
import Corners from '@/components/Corners.vue';
import Dropdown from '@/components/Dropdown.vue';
import ContentForm from '@/components/ContentForm.vue';
import History from './History.vue';
import TabButton from '@/components/TabButton.vue';
import ReceiveForm from '../ReceiveForm.vue';
import SendForm from '../SendForm.vue';
import TeleportForm from '../TeleportForm.vue';
import BuyForm from '../BuyForm.vue';
import SelectNetworkButton from '../SelectNetworkButton.vue';
import SelectPopup from '@/components/SelectPopup.vue';
import BaseApi from '@/util/BaseApi';
import { Component, Vue } from 'vue-property-decorator';
import { Currencies } from '@/interfaces/currencies';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { Networks as NetworksType } from '@/store/networks/types';
import { Components } from '@/router/routes';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/helpers';
import { formattedNumber, formattedPrice } from '@/util/numbers';
import type { FilterHistory } from '@/interfaces/common';
import type { History as THistory } from '@/interfaces/history';

@Component({
  components: {
    Scroll,
    Corners,
    History,
    BuyForm,
    SendForm,
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
  showBuyForm = false;
  showSelectNetworkPopup = false;

  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworksType;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;
  @Getter(NetworksGettersTypes.getHistory) history!: THistory;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getFiatSymbol) fiatSymbol!: string;

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

    const availableInNetworks = this.currentCurrency.getAvailableInNetworks(this.selectedWallet);
    const balance = availableInNetworks.find(({ network }) => network === this.selectedNetwork)?.balance;
    const total = formattedNumber(+(balance?.total ?? 0), 4);

    return `${this.selectedToken.toUpperCase()} ${+total}`;
  }

  get balanceInNetworkString() {
    if (!this.currentCurrency) return `$ 0`;

    const total = this.currentCurrency.getBalanceInNetwork(this.selectedNetwork, this.selectedWallet);

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

  toggleVisible(field: 'showSendForm' | 'showReceiveForm' | 'showTeleportForm' | 'showBuyForm', value: boolean) {
    this[field] = value;
  }
}
</script>

<style lang="scss" scoped>
.token {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

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
        white-space: nowrap;
        text-align: left;
        max-width: 265px;
        overflow: hidden;
        text-overflow: ellipsis;
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

  .activity-block {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .content {
    height: 100%;
    display: flex;
    flex-direction: column;

    .content-settings {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 11px 16px 5px 18px;

      .history-label {
        font-weight: 600;
      }
    }
  }
}
</style>
