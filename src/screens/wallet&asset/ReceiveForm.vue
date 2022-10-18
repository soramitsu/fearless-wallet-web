<template>
  <ActivityForm
    class="receive-form"
    header="Receive Funds"
    iconName="share"
    iconNameTwo="receive-white"
    buttonText="Copy QR-code"
    buttonTextTwo="Save QR-code image"
    :closeForm="closeForm"
    :handlerButton="shareQR"
    :handlerButtonTwo="saveQR"
  >
    <Select v-model="network" :options="optionsNetwork" placeholder="NETWORK" size="big" class="row" />

    <div class="receive-content">
      <div class="address-wrapper">
        <span>Wallet address</span>

        <div class="address">
          {{ cutAddress }}

          <img src="@/assets/copy.svg" class="copy-icon" @click="copyAddress" />
        </div>
      </div>

      <QR class="qr" ref="qr" :width="200" :payload="address" />
    </div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import ActivityForm from './ActivityForm.vue';
import type { Networks } from '@/interfaces/networks';
import BaseApi from '@/util/BaseApi';
import Select from '@/components/Select.vue';
import Button from '@/components/Button.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { firstCharToUp } from '@/helpers/common';
import QR from '@/components/QR.vue';
import { cut } from '@/helpers/history';

@Component({
  components: {
    QR,
    Select,
    Button,
    ActivityForm,
  },
})
export default class ReceiveForm extends Vue {
  network = 'polkadot';

  @Prop(String) selectedNetwork!: string;
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;

  get optionsNetwork() {
    return this.networks.map(({ name }) => ({ label: firstCharToUp(name), value: name }));
  }

  get address() {
    if (this.selectedWallet.address === '') return '';

    return BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.network);
  }

  get cutAddress() {
    return cut(this.address, 5);
  }

  mounted() {
    this.network = this.selectedNetwork;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }

  createBlob() {
    const imgQR = (this.$refs.qr as Vue).$el;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = imgQR.clientWidth;
    canvas.height = imgQR.clientHeight;

    context?.drawImage(imgQR as CanvasImageSource, 0, 0);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  async shareQR() {
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
  .receive-content {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    height: 100%;
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

  .button {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 20px;
    color: $pink-lavender-color;
    opacity: 0.95;
    margin-top: 10px;
    user-select: none;
  }

  .copy-icon {
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
}
</style>
