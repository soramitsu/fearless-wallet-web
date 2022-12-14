<template>
  <AboveForm header="accounts.exportJson" :blur="true" :closeHandler="closeForm">
    <div class="export-form">
      <div class="export-content">
        <Input
          v-model="exportType"
          placeholder="common.sourceType"
          size="big"
          class="export-type-input"
          :readonly="true"
        />

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
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces/networks';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';

@Component
export default class ExportForm extends Vue {
  exportType = 'Restore JSON';

  @Prop(String) password!: string;
  @Prop(Function) closeHandler!: (password: string) => void;
  @Getter(AccountsGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.getAllNetworks) networks!: Networks;

  get network() {
    return this.$route.params.network;
  }

  get substrateAddress() {
    const json = Object.entries(this.keyringPairJson)
      .sort(([key]) => (key === 'address' ? -1 : 0))
      .reduce((result, [key, value]) => ({ ...result, [key]: value }), {});

    return JSON.stringify(json);
  }

  get addressByNetwork() {
    return BaseApi.getDefaultAddressByNetworkIncludingReplacedAccount(this.selectedWallet, this.network);
  }

  get keyringPairJson() {
    const keyringPair = BaseApi.getPair(this.addressByNetwork);

    return keyringPair.toJson(this.password);
  }

  closeForm() {
    BaseApi.lockPair(this.addressByNetwork);

    this.closeHandler('');
  }

  proceed() {
    this.export();
    this.closeForm();
  }

  export() {
    const chainId = this.networks.find(({ name }) => name === this.network)!.chainId;
    const meta = { ...this.keyringPairJson.meta, genesisHash: `0x${chainId}` } as Record<string, string>;

    delete meta['ethereumAddress'];
    delete meta['isReplacedAccount'];
    delete meta['replacedSettings'];

    const jsonSubstrate = JSON.stringify({ ...this.keyringPairJson, meta });
    const blobSubstrate = new Blob([jsonSubstrate], { type: 'application/json; charset=utf-8' });

    saveAs(blobSubstrate, `${this.addressByNetwork}.json`);
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
