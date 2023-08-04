<template>
  <AboveForm header="accounts.exportJson" :blur="true" :closeHandler="closeForm">
    <div class="export-form">
      <Loader v-if="isLoading" />
      <template v-else>
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
      </template>
    </div>
  </AboveForm>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import { Vue, Component, Prop } from 'vue-property-decorator';
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces/networks';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { exportAccount } from '@/extension/messaging';

@Component
export default class ExportForm extends Vue {
  exportType = 'Restore JSON';
  json: KeyringPair$Json = {} as KeyringPair$Json;
  isLoading = true;
  @Prop(String) password!: string;
  @Prop(Function) closeHandler!: (password: string) => void;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;

  get network() {
    return this.$route.params.network;
  }

  get substrateAddress() {
    const json = Object.entries(this.json)
      .sort(([key]) => (key === 'address' ? -1 : 0))
      .reduce((result, [key, value]) => ({ ...result, [key]: value }), {});

    return JSON.stringify(json);
  }

  get addressByNetwork() {
    return BaseApi.formatAddress(this.selectedWallet, this.network);
  }

  async mounted() {
    const { exportedJson: json } = await this.keyringPairJson();
    this.json = json;

    this.isLoading = false;
  }

  async keyringPairJson() {
    return exportAccount(this.addressByNetwork, this.password);
  }

  closeForm() {
    this.closeHandler('');
  }

  proceed() {
    this.export();
    this.closeForm();
  }

  async export() {
    const chainId = this.networks.find(({ name }) => name === this.network)!.chainId;
    const meta = { ...this.json.meta, genesisHash: `0x${chainId}` } as unknown as Record<string, string>;

    delete meta['ethereumAddress'];

    const jsonSubstrate = JSON.stringify({ ...this.json, meta });

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
