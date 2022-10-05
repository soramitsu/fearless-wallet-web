<template>
  <ActivityForm header="Receive Funds" :closeForm="closeForm" :showButton="false" class="receive-form">
    <Select v-model="network" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

    <div class="receive-content">
      <div class="address">{{ address }}</div>

      <div class="button" @click="copyAddress">
        <img src="@/assets/copy-lavender.svg" class="icon" />

        Copy address
      </div>

      <QR :payload="address" :width="200" foreground="#bb77ff" />
    </div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
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

@Component({
  components: {
    ActivityForm,
    QR,
    Select,
    Button,
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
    user-select: none;

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
