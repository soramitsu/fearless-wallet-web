<template>
  <AboveForm header="assets.receiveFunds" :blur="true" :closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <RotateInput
          v-model="selectedNetwork"
          placeholder="assets.network"
          :ref="selectNetworkInputRef"
          :isActiveRotate="showSelectNetworkPopup"
          @click="toggleSelectNetworkPopupVisible"
        />

        <div class="receive-content">
          <div class="address-wrapper">
            <span>{{ $t('assets.walletAddress') }}</span>

            <div class="address">
              {{ cutAddress }}

              <Icon icon="copy" className="copy-icon" @click="copyAddress" />
            </div>
          </div>

          <QR class="qr" ref="qr" :showLogo="true" :width="200" :payload="address" />
        </div>

        <Tooltip text="common.copied" target=".copy-icon" placement="bottom" trigger="click" />
      </div>

      <div class="activity-buttons">
        <BorderButton
          size="big"
          class="button"
          text="assets.saveQR"
          width="260px"
          iconName="receive-white"
          @click="saveQR"
        />

        <Button size="big" class="button copy-qr" width="260px" text="assets.copyQR" iconName="share" @click="copyQR" />

        <Tooltip :text="copyQRTooltip" target=".copy-qr" placement="bottom" trigger="click" />
      </div>
    </div>

    <SelectPopup
      v-if="showSelectNetworkPopup"
      class="select-network-popup"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      horizontalPlacement="left"
      :value="selectedNetwork"
      :showBlur="false"
      :showBackground="false"
      :top="148"
      :left="-160"
      :height="360"
      :options="optionsNetworks"
      :handlerFilter="handlerFilter"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import RotateInput from './RotateInput.vue';
import type { Currencies } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store';
import { firstCharToUp } from '@/helpers/common';
import { cut } from '@/helpers/history';
import { ETHEREUM_NETWORKS } from '@/consts/networks';
import NetworksController from '@/controllers/networksController';

@Component({
  components: { RotateInput },
})
export default class ReceiveForm extends Vue {
  readonly selectNetworkInputRef = 'selectNetworkInput';
  readonly copyQRTooltip = { text: 'common.copiedValue', localeProps: { value: 'QR' } };
  filterValue = '';
  selectedNetwork = 'polkadot';
  showSelectNetworkPopup = false;

  @Prop(String) _selectedNetwork!: string;
  @Prop(Function) closeForm!: VoidFunction;
  @Prop(String) selectedAssetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getCurrencies) currencies!: Currencies;

  get currency() {
    return this.currencies.find(({ assetId }) => assetId === this.selectedAssetId);
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  get optionsNetworks() {
    const haveEthereumAccount = this.selectedWallet.ethereumAddress !== '';
    const walletBalance = (this.currency?.getNetworkList() ?? []).filter(({ network }) =>
      ETHEREUM_NETWORKS.includes(network) ? haveEthereumAccount : true
    );
    const filter = this.filterValue.trim().toLowerCase();

    return walletBalance
      .map(({ network, type }) => {
        const icon = NetworksController.getNetwork(network).icon;

        return {
          label: firstCharToUp(network),
          value: network,
          path: icon,
          type,
          relayChain: this.currency?.relayChain,
        };
      })
      .filter(({ value }) => {
        return value.includes(filter);
      });
  }

  mounted() {
    const nativeNet = this.getNetworkNameByAsset();

    if (nativeNet === undefined) {
      const utilityNet = this.getNetworkNameByAsset(false);

      if (utilityNet !== undefined) this.selectedNetwork = utilityNet.value;
      else
        this.selectedNetwork = this._selectedNetwork === 'all' ? this.optionsNetworks[0].value : this._selectedNetwork;

      return;
    }

    this.selectedNetwork = nativeNet.value;
  }

  getNetworkNameByAsset(isNative = true) {
    return this.optionsNetworks.find(({ value }) => {
      const network = NetworksController.getNetwork(value);

      const assetIndex = network.assets.findIndex((asset) => {
        const key = isNative ? 'isNative' : 'isUtility';

        return asset.assetId === this.selectedAssetId && asset[key];
      });

      return assetIndex !== -1;
    });
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }

  createBlob() {
    const el = (this.$refs.qr as Vue).$el;
    const imgQR = el.firstChild as Element;
    // const imgLogo = el.lastChild as Element;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = imgQR.clientWidth;
    canvas.height = imgQR.clientHeight;

    context?.drawImage(imgQR as CanvasImageSource, 0, 0);
    // context?.drawImage(imgLogo as CanvasImageSource, 67.5, 85, 65, 30);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  copyQR() {
    navigator.clipboard.write([
      new ClipboardItem({
        'image/png': this.createBlob() as Promise<Blob>,
      }),
    ]);
  }

  async saveQR() {
    saveAs((await this.createBlob()) as Blob, `${this.address}.png`);
  }
}
</script>

<style lang="scss" scoped>
.select-network-popup {
  text-transform: capitalize;
}

.receive-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;

  .receive-content {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
  }

  .address-wrapper {
    display: flex;
    justify-content: space-between;
    padding: 16px 16px;
    width: 100%;
    color: rgba(255, 255, 255, 0.75);
    border-bottom: 0.5px solid $default-background-color;

    .address {
      display: flex;
    }
  }

  .copy-icon {
    width: 20px;
    height: 20px;
    margin-left: 16px;
    filter: invert(0.35);

    &:hover {
      cursor: pointer;

      filter: invert(0.25);
    }
  }

  .qr {
    margin: 16px 0;
  }

  .button {
    margin-right: 10px;

    &:last-child {
      margin-right: 0;
    }
  }

  .activity-buttons {
    display: flex;
  }
}
</style>
