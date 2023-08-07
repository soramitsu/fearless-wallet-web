<template>
  <div class="asset">
    <AssetInfo :currency="currentCurrency" :price="assetPrice" :showShimmers="showShimmers" />

    <router-view
      @openHistoryDetailsForm="openHistoryDetailsForm"
      @selectNetworkHistory="selectNetworkHistory"
      :currency="currentCurrency"
      :showBuyButton="showBuyButton"
      :showCrossChainButton="showCrossChainButton"
      :showSwapButton="showSwapButton"
      :togglePopupButton="togglePopupButton"
      :openSoraSwap="openSoraSwap"
      @toggleVisible="toggleVisible"
    >
    </router-view>

    <SendForm
      v-if="showSendForm"
      :_selectedNetwork="selectedNetwork"
      :_selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showSendForm', false)"
    />

    <ReceiveForm
      v-if="showReceiveForm"
      :_selectedNetwork="selectedNetwork"
      :selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showReceiveForm', false)"
    />

    <CrossChainForm
      v-if="showCrossChainForm"
      :_originalNetwork="selectedNetwork"
      :_selectedAssetId="selectedAssetId"
      :closeForm="toggleVisible.bind(null, 'showCrossChainForm', false)"
    />

    <HistoryDetailsForm
      v-if="showHistoryDetailsForm"
      :handlerClose="closeHistoryDetailsForm"
      :historyElement="historyElement"
      :assetId="selectedAssetId"
    />

    <BuyPopup
      v-if="showBuyPopup"
      :asset="selectedAssetUpper"
      :address="displayAddressByNetwork"
      :providers="providers"
      :closePopup="toggleVisible.bind(null, 'showBuyPopup', false)"
    />

    <NetworkManagement
      v-if="showSelectNetworkPopup"
      :type="selectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />
    <Tooltip text="common.networkManagement" target=".select-network-button" placement="bottom" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter, Mutation } from 'vuex-class';
import { getNativeAssetName } from '@extension-base/background/utils/utils';
import { NetworkJson } from '@extension-base/types';
import HistoryDetailsForm from './HistoryDetailsForm.vue';
import type { HistoryElement } from '@/interfaces/history';
import type { AssetTipDataProps, GetAssetPrice, SelectedWallet } from '@/store';
import SelectNetworkButton from '@/screens/wallet&asset/SelectNetworkButton.vue';
import NetworkManagementButton from '@/screens/main/NetworkManagementButton.vue';
import ReceiveForm from '@/screens/wallet&asset/ReceiveForm.vue';
import Blur from '@/components/Blur.vue';

import SendForm from '@/screens/wallet&asset/SendForm.vue';
import AssetInfo from '@/screens/wallet&asset/asset/AssetInfo.vue';
import CrossChainForm from '@/screens/wallet&asset/CrossChainForm.vue';
import BuyPopup from '@/screens/wallet&asset/BuyPopup.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { MutationTypes as AccountsMutationTypes } from '@/store/accounts/mutations';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { Components } from '@/router/routes';
import { NETWORK_GROUP } from '@/consts/networks';
import { isSora } from '@/helpers';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { isNetworkGroup } from '@/helpers/common/index';
import NetworkManagement from '@/screens/wallet&asset/NetworkManagement.vue';
type ShowField = 'showSendForm' | 'showReceiveForm' | 'showCrossChainForm' | 'showBuyPopup';

@Component({
  components: {
    AssetInfo,
    Blur,
    SendForm,
    BuyPopup,
    ReceiveForm,
    CrossChainForm,
    SelectNetworkPopup,
    HistoryDetailsForm,
    SelectNetworkButton,
    NetworkManagementButton,
    NetworkManagement,
  },
})
export default class Asset extends Vue {
  readonly selectNetworkButtonRef = 'selectNetworkButton';

  historyElement: HistoryElement | Record<string, string> = {};
  showSendForm = false;
  showReceiveForm = false;
  showCrossChainForm = false;
  showBuyPopup = false;
  showPopupButton = false;
  showTipPopup = false;
  showHistoryDetailsForm = false;
  showSelectNetworkPopup = false;
  filterValue = '';

  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getSelectedNetwork) selectedNetwork!: string;
  @Getter(AccountsGettersTypes.fiatSymbol) fiatSymbol!: string;
  @Getter(AccountsGettersTypes.isOnline) isOnline!: boolean;
  @Getter(NetworksGettersTypes.getAssetPrice) getAssetPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];
  @Getter(NetworksGettersTypes.getAssetPrice) getTokenPrice!: GetAssetPrice;
  @Getter(NetworksGettersTypes.getNetwork) getNetwork!: (value: string) => NetworkJson;

  get isGroupIcon() {
    return isNetworkGroup(this.selectedNetwork);
  }

  get selectedNetworkIcon() {
    if (this.isGroupIcon) return 'all-networks';

    return this.getNetwork(this.selectedNetwork).icon;
  }

  get showShimmers() {
    return !this.isOnline || !this.balances.length || this.currentNetwork?.state === 'pending';
  }

  get selectedAssetNetwork() {
    if (this.$route.params.network === undefined) return '';

    return this.$route.params.network;
  }

  get selectedNetworkForHistory() {
    if (!NETWORK_GROUP.includes(this.selectedNetwork)) return this.selectedNetwork;

    return this.selectedAssetNetwork;
  }

  get isSelectedNetworkHistory() {
    if (!NETWORK_GROUP.includes(this.selectedNetwork)) return false;

    return this.selectedAssetNetwork === '';
  }

  get providers() {
    return this.currentCurrency.providers ?? [];
  }

  get showCrossChainButton() {
    const network = this.networks.find(
      ({ name }) => name.toLowerCase() === this.selectedNetworkForHistory?.toLowerCase()
    );

    const asset = getNativeAssetName(this.selectedAsset);

    if (!network || network.xcm === undefined) return false;

    return network.xcm.availableAssets.some((assetName) => assetName.toLowerCase() === asset);
  }

  get showSwapButton() {
    return isSora(this.selectedNetwork) && !this.selectedWallet.isMobile;
  }

  get currentNetwork() {
    return this.currentCurrency.balances?.find(
      ({ name }) => name.toLowerCase() === this.selectedNetwork?.toLowerCase()
    );
  }

  get isMainNetwork() {
    return this.currentNetwork && this.currentNetwork.name === this.mainNetwork;
  }

  get mainNetwork() {
    const currency = this.currentCurrency.balances?.find((network) => network.isUtility || network.isNative);

    return currency ? currency.name : '';
  }

  get showBuyButton() {
    return this.providers.length !== 0 && this.mainNetwork?.toLowerCase() === this.selectedNetwork?.toLowerCase();
  }

  get currentCurrency() {
    return this.balances.find(({ assetId: id }) => id === this.selectedAssetId)! ?? {};
  }

  get displayAddressByNetwork() {
    if (this.isSelectedNetworkHistory) return BaseApi.formatAddress(this.selectedWallet, this.mainNetwork);

    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get selectedAsset() {
    return this.currentCurrency.symbol?.toLowerCase() ?? '';
  }

  get iconPosition() {
    const isPopup = BaseApi.useIsPopup();

    return `top: 24px; right:${isPopup ? '67px' : '131px'};`;
  }

  get selectedAssetUpper() {
    return this.selectedAsset.toUpperCase();
  }

  get assetPrice() {
    return this.getAssetPrice(this.currentCurrency.priceId ?? '');
  }

  toggleVisible(field: ShowField, value = true) {
    this[field] = value;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  openHistoryDetailsForm(historyElement: HistoryElement) {
    this.showHistoryDetailsForm = true;
    this.historyElement = historyElement;
  }

  closeHistoryDetailsForm() {
    this.showHistoryDetailsForm = false;
    this.historyElement = {};
  }

  selectNetworkHistory(name: string) {
    this.$router.push({
      name: Components.AssetHistory,
      params: {
        network: name,
      },
    });
  }

  togglePopupButton() {
    this.showPopupButton = !this.showPopupButton;
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  openSoraSwap() {
    this.$router.push({
      name: Components.SoraSwap,
      params: {
        assetId: this.selectedAssetId,
        reset: '',
      },
    });
  }
}
</script>

<style lang="scss" scoped>
.asset {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  height: 450px;

  .popup-tip {
    position: absolute;
    display: flex;
    flex-flow: column;
    align-items: flex-end;
    height: 100px;
    width: 100%;
    gap: 10px;
    .controls {
      display: flex;
      flex-flow: row nowrap;
      align-items: center;
      gap: 15px;
    }
    .background-ellipse {
      display: flex;
      align-items: center;
      height: 32px;
      padding: 12px;
      font-size: 12px;
      line-height: 18px;
      border-radius: 20px;
      background-color: $default-background-color;
      user-select: none;
    }
    .popup-tip__message {
      width: 260px;
    }
    .popup__button-width {
      width: 42px;
    }
    .icon-arrow-tip {
      display: flex;
      flex-flow: column;
      width: 100%;
      align-items: flex-end;
      padding-right: 60px;
      gap: 20px;
    }
    .icon__close {
      height: 18px;
      width: 18px;
    }
  }
  .popup-button {
    position: absolute;
    display: flex;
    flex-flow: column;
    align-items: flex-end;
    top: 250px;
    left: 465px;
    height: 100px;
    gap: 10px;

    .popup__button-width {
      width: 42px;
    }
  }
}
</style>
