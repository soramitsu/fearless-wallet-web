<template>
  <ActivityForm
    header="Receive Funds"
    buttonText="Copy address"
    :closeForm="closeForm"
    :showButton="false"
    class="receive-form"
  >
    <Select v-model="network" :options="optionsNetwork" placeholder="Network" size="big" class="row" />

    <div class="receive-content">
      <div class="address">{{ address }}</div>

      <s-button class="button" type="link" border-radius="mini" @click="copyAddress">
        <s-icon name="basic-copy-24" class="icon" />
        <span>Copy address</span>
      </s-button>

      <QrCode :value="address" :size="200" render-as="svg" :margin="10" foreground="#bb77ff" background="#111111" />
    </div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import { GettersTypes as ApisGettersTypes } from '@/store/api/getters';
import { Networks } from '@/store/api/types';
import ActivityForm from './ActivityForm.vue';
import QrCode from 'qrcode.vue';
import Select from '@/components/Select.vue';
import { firstCharToUp } from '@/util/stringHelper';

@Component({
  components: {
    ActivityForm,
    QrCode,
    Select,
  },
})
export default class extends Vue {
  network = '';

  @Prop(String) selectedNetwork!: string;
  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsNetwork() {
    return Object.keys(this.networksInfo).map((network) => ({ label: firstCharToUp(network), value: network }));
  }

  get address() {
    return this.selectedWallet.address;
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
    color: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 180%;
    margin-bottom: 20px;
    color: var(--pink-lavender-color);
    opacity: 0.95;

    span {
      font-weight: 400;
    }

    &:hover {
      color: var(--pink-lavender-color);
      opacity: 1;
    }
  }

  .icon {
    width: 20px;
    height: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    margin-right: 10px;
    color: var(--pink-lavender-color);
  }
}
</style>
