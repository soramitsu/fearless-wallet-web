<template>
  <ActivityForm
    header="Receive Funds"
    buttonText="Copy address"
    :handlerButton="copyAddress"
    :closeForm="closeForm"
    class="receive-form"
  >
    <div class="qr">
      <qrcode-vue
        :value="address"
        :size="200"
        render-as="svg"
        :margin="10"
        foreground="#bb77ff"
        background="#111111"
      ></qrcode-vue>
    </div>
  </ActivityForm>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';
import ActivityForm from './ActivityForm.vue';
import QrcodeVue from 'qrcode.vue';

@Component({
  components: {
    ActivityForm,
    QrcodeVue,
  },
})
export default class extends Vue {
  network = '';

  @Prop(Function) closeForm!: VoidFunction;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get address() {
    return this.selectedWallet.address;
  }

  copyAddress() {
    navigator.clipboard.writeText(this.address);
  }
}
</script>

<style lang="scss" scoped>
.receive-form {
  .qr {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }
}
</style>
