<template>
  <AboveForm header="assets.receiveFunds" :fullScreen="true" @closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          :value="selectedNetwork"
          placeholder="assets.network"
          icon="rotate"
          data-testid="selectedNetwork"
          :ref="selectNetworkInputRef"
          :isActiveRotate="showSelectNetworkPopup"
          @click="toggleSelectNetworkPopupVisible"
        />

        <div class="receive-content">
          <div class="address-wrapper">
            <span>{{ $t('assets.walletAddress') }}</span>

            <div class="address" data-testid="cutAddress">
              {{ cutAddress }}

              <Icon icon="copy" className="copy-icon" data-testid="copyAddress" @click="copyAddress" />
            </div>
          </div>

          <QR class="qr" ref="qr" data-testid="qr" :showLogo="true" :width="200" :payload="address" />
        </div>

        <Tooltip text="common.copied" target=".copy-icon" placement="bottom" trigger="click" />
      </div>

      <div class="activity-buttons">
        <BorderButton
          size="big"
          class="button"
          text="assets.saveQR"
          iconName="receive-white"
          data-testid="saveQR"
          :width="widthSaveBtn"
          @click="saveQR"
        />

        <FButton
          v-if="showCopyBtn"
          size="big"
          class="button copy-qr"
          text="assets.copyQR"
          iconName="share"
          data-testid="copyQR"
          width="260px"
          @click="copyQR"
        />

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
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedNetwork"
      @handlerClose="toggleSelectNetworkPopupVisible"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import type { TokenGroup } from '@extension-base/background/types/types';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { type SelectedWallet } from '@/store';
import { cut } from '@/helpers';

@Component
export default class ReceiveForm extends Vue {
  readonly selectNetworkInputRef = 'selectNetworkInput';
  readonly copyQRTooltip = {
    text: 'common.copiedValue',
    localeProps: { value: 'QR' },
  };

  filterValue = '';
  selectedNetwork = 'polkadot';
  showSelectNetworkPopup = false;

  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(AccountsGettersTypes.getBalances) balances!: TokenGroup[];

  get _selectedNetwork() {
    return this.$route.params.network ?? '';
  }

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get assetNetworks() {
    const currency = this.balances.find(({ groupId }) => groupId === this.selectedAssetId)!;

    return (
      currency?.balances
        .map(({ name, icon }) => ({ name, icon, value: name }))
        .filter(({ name }) => name.toLowerCase().includes(this.filterValue.toLowerCase())) ?? []
    );
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.formatAddress(this.selectedWallet, this.selectedNetwork);
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  get widthSaveBtn() {
    return this.showCopyBtn ? '260px' : '530px';
  }

  get showCopyBtn() {
    return !window.navigator.userAgent.toLowerCase().includes('firefox');
  }

  mounted() {
    this.selectedNetwork = this._selectedNetwork;
  }

  closeForm() {
    this.$router.back();
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
    margin-left: 10px;

    &:first-child {
      margin-left: 0;
    }
  }

  .activity-buttons {
    display: flex;
  }
}
</style>
