<template>
  <AboveForm header="asset.receiveFunds" :blur="true" :closeHandler="closeForm">
    <div class="receive-form">
      <div>
        <RotateInput
          v-model="selectedNetwork"
          placeholder="asset.network"
          :ref="selectNetworkInputRef"
          :isActiveRotate="showSelectNetworkPopup"
          @click="toggleSelectNetworkPopupVisible"
        />

        <div class="receive-content">
          <div class="address-wrapper">
            <span>{{ $t('asset.walletAddress') }}</span>

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
          text="asset.saveQR"
          width="260px"
          iconName="receive-white"
          @click="saveQR"
        />

        <Button size="big" class="button copy-qr" width="260px" text="asset.copyQR" iconName="share" @click="copyQR" />

        <Tooltip :text="copyQRTooltip" target=".copy-qr" placement="bottom" trigger="click" />
      </div>
    </div>

    <SelectNetworkPopup
      v-if="showSelectNetworkPopup"
      horizontalPlacement="left"
      verticalPlacement="top"
      :selectedNetwork="selectedNetwork"
      :top="148"
      :left="-160"
      :height="360"
      :allNetworksItem="false"
      :showBlur="false"
      :showBackground="false"
      :toggleSelectedNetwork="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />
  </AboveForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import RotateInput from './RotateInput.vue';
import type { Networks } from '@/interfaces/networks';
import BaseApi from '@/util/BaseApi';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { firstCharToUp } from '@/helpers/common';
import QR from '@/components/QR.vue';
import { cut } from '@/helpers/history';
import AboveForm from '@/components/AboveForm.vue';
import BorderButton from '@/components/BorderButton.vue';
import SelectNetworkPopup from '@/screens/wallet&asset/SelectNetworkPopup.vue';
import Tooltip from '@/components/Tooltip.vue';

@Component({
  components: {
    QR,
    Input,
    Button,
    Tooltip,
    AboveForm,
    RotateInput,
    BorderButton,
    SelectNetworkPopup,
  },
})
export default class ReceiveForm extends Vue {
  readonly selectNetworkInputRef = 'selectNetworkInput';
  readonly copyQRTooltip = { text: 'common.copiedValue', localeProps: { value: 'QR' } };

  selectedNetwork = 'polkadot';
  showSelectNetworkPopup = false;

  @Prop(String) _selectedNetwork!: string;
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;

  get optionsNetwork() {
    return this.networks.map(({ name }) => ({ label: firstCharToUp(name), value: name }));
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.selectedNetwork);
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  mounted() {
    this.selectedNetwork = this._selectedNetwork;
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
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
    border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);

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
