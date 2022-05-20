<template>
  <ActivityForm header="Receive Funds" :closeForm="closeForm" :showButton="false" class="receive-form">
    <Select v-model="network" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

    <div class="receive-content">
      <div class="address">{{ address }}</div>

      <div class="button" @click="copyAddress">
        <img src="@/assets/copy.svg" class="icon" />

        Copy address
      </div>

      <QrCode :value="address" :size="200" render-as="svg" :margin="10" foreground="#bb77ff" background="#111111" />
    </div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { GettersTypes as ApisGettersTypes } from '@/store/networks/getters';
import { Networks } from '@/store/networks/types';
import { firstCharToUp } from '@/util/stringHelper';
import ActivityForm from './ActivityForm.vue';
import QrCode from 'qrcode.vue';
import Select from '@/components/Select.vue';
import Button from '@/components/Button.vue';
import NetworksController from '@/controllers/networksController';

@Component({
  components: {
    ActivityForm,
    QrCode,
    Select,
    Button,
  },
})
export default class ReceiveForm extends Vue {
  network = 'polkadot';

  @Prop(String) selectedNetwork!: string;
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsNetwork() {
    return this.networksInfo.map(({ name }) => ({ label: firstCharToUp(name), value: name }));
  }

  get address() {
    if (this.selectedWallet.type === 'ethereum') return this.selectedWallet.address;

    return NetworksController.formatAddress(this.selectedWallet.address, this.network);
  }

  mounted() {
    this.network = this.selectedNetwork;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }
}
</script>

<style lang="scss" scoped>
.receive-form {
  .receive-content {
    display: flex;
    flex-direction: column;
    justify-content: start;
    align-items: center;
    height: 100%;
  }

  .address {
    color: rgba(255, 255, 255, 0.75);
    font-size: 14px;
    margin-top: 25px;
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

    &:hover {
      cursor: pointer;
      opacity: 1;
    }

    .icon {
      margin-right: 5px;
    }
  }
}
</style>
