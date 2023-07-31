<template>
  <AboveForm header="assets.receiveFunds" :fullScreen="true" :closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          v-model="selectedNetwork"
          placeholder="assets.network"
          icon="rotate"
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
      :options="assetNetworks"
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
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store';
import { cut } from '@/helpers/common';
import { TokenBalance } from '@/extension/background/extension-base/src/background/types/types';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

@Component
export default class ReceiveForm extends Vue {
  readonly selectNetworkInputRef = 'selectNetworkInput';
  readonly copyQRTooltip = { text: 'common.copiedValue', localeProps: { value: 'QR' } };
  filterValue = '';
  selectedNetwork = 'polkadot';
  showSelectNetworkPopup = false;

  @Prop(String) _selectedNetwork!: string;
  @Prop(String) selectedAssetId!: string;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenBalance[];
  @Getter(NetworksGettersTypes.networks) networks!: NetworkJson[];

  get assetNetworks() {
    const currency = this.balances.find(({ assetId }) => assetId === this.selectedAssetId)!;

    return (
      currency?.balances
        .map(({ name, icon }) => ({ name, icon, value: name }))
        .filter(({ name }) => name.toLowerCase().includes(this.filterValue.toLowerCase())) ?? []
    );
  }

  get decimals() {
    return this.networks?.find((network) => network.name.toLowerCase() === this.selectedNetwork.toLowerCase())
      ?.addressPrefix;
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    if (BaseApi.isEthereumNetwork(this.selectedNetwork)) return this.selectedWallet.ethereumAddress;

    return BaseApi.encodeAddress(this.selectedWallet.address, this.decimals);
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  mounted() {
    this.selectedNetwork = this._selectedNetwork;
  }

  closeForm() {
    this.$emit('closeForm');
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
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = imgQR.clientWidth;
    canvas.height = imgQR.clientHeight;

    context?.drawImage(imgQR as CanvasImageSource, 0, 0);

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
