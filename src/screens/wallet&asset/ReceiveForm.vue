<template>
  <AboveForm header="assets.receiveFunds" :fullScreen="true" @closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <InputWithIcon
          placeholder="assets.network"
          icon="rotate"
          data-testid="selectedNetwork"
          :value="selectedNetwork"
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
import { saveAs } from 'file-saver';
import BaseApi from '@/util/BaseApi';
import { cut, setClipboard } from '@/helpers';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

@Component
export default class ReceiveForm extends Vue {
  readonly selectNetworkInputRef = 'selectNetworkInput';
  readonly copyQRTooltip = {
    text: 'common.copiedValue',
    localeProps: { value: 'QR' },
  };

  networksStore = useNetworksStore();
  accountsStore = useAccountsStore();
  filterValue = '';
  selectedNetwork = 'polkadot';
  showSelectNetworkPopup = false;

  get selectedAssetId() {
    return this.$route.params.assetId ?? '';
  }

  get assetNetworks() {
    const currency = this.accountsStore.balances.find(({ groupId }) => groupId === this.selectedAssetId);
    const filter = this.filterValue.toLowerCase();

    return (
      currency?.balances
        .map(({ name, icon }) => {
          const network = this.networksStore.getNetwork(name);

          return {
            name: network.name,
            value: network.name,
            icon,
          };
        })
        .filter(({ name }) => name.toLowerCase().includes(filter)) ?? []
    );
  }

  get address() {
    if (this.accountsStore.selectedWallet.address === '') return '';

    return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.selectedNetwork);
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
    this.selectedNetwork = this.$route.params.network ?? '';
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
    setClipboard(this.address);
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
