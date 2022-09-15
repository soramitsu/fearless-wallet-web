<template>
  <AboveForm header="Export JSON" :closeHandler="closeForm.bind(null, '')">
    <div class="export-form">
      <div class="export-content">
        <Input v-model="exportType" placeholder="Source type" size="big" class="export-type-input" :readonly="true" />

        <Input v-model="substrateAddress" class="row" size="big" placeholder="Substrate" :readonly="true" />
      </div>

      <Button size="big" fontSize="big" width="100%" text="Export" @click="proceed" />
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import { Vue, Component, Prop } from 'vue-property-decorator';
import type { SelectedWallet } from '@/store/accounts/types';
import type { Networks } from '@/interfaces/networks';
import Input from '@/components/Input.vue';
import Button from '@/components/Button.vue';
import BaseApi from '@/util/BaseApi';
import AboveForm from '@/components/AboveForm.vue';
import ValidatedInput from '@/components/ValidatedInput.vue';
import InformationBlock from '@/components/InformationBlock.vue';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component({
  components: {
    Input,
    Button,
    AboveForm,
    ValidatedInput,
    InformationBlock,
  },
})
export default class ExportForm extends Vue {
  exportType = 'Restore JSON';

  @Prop(String) password!: string;
  @Prop(Function) closeForm!: (password: string) => void;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getNetworks) networks!: Networks;

  get network() {
    return this.$route.params.network;
  }

  get substrateAddress() {
    const address = BaseApi.getDisplayAddressByNetwork(this.selectedWallet, this.network);

    return JSON.stringify({ address });
  }

  proceed() {
    this.export();
    this.closeForm('');
  }

  export() {
    const chainId = this.networks.find(({ name }) => name === this.network)!.chainId; //eslint-disable-line
    const addressSubstrate = BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(
      this.selectedWallet,
      this.network
    );
    const keyringPair = BaseApi.getPair(addressSubstrate);
    const keyringPair$Json = keyringPair.toJson(this.password);
    const meta = { ...keyringPair$Json.meta, genesisHash: `0x${chainId}` } as Record<string, string>;

    delete meta['ethereumAddress'];
    delete meta['isReplacedAccount'];
    delete meta['replacedSettings'];

    const jsonSubstrate = JSON.stringify({ ...keyringPair$Json, meta });
    const blobSubstrate = new Blob([jsonSubstrate], { type: 'application/json; charset=utf-8' });

    keyringPair.lock();

    saveAs(blobSubstrate, `${addressSubstrate}.json`);
  }
}
</script>

<style lang="scss" scoped>
.export-form {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .export-content {
    display: flex;
    flex-direction: column;
  }

  .export-type-input {
    width: 100%;
  }

  .row {
    margin-top: 16px;
  }
}
</style>
