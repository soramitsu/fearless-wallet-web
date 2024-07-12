<template>
  <AboveForm header="accounts.exportJson" :fullScreen="true" @closeHandler="closeForm">
    <div class="export-form">
      <Loader v-if="isLoading" />

      <template v-else>
        <div class="export-content">
          <FInput
            :value="exportType"
            placeholder="common.sourceType"
            size="big"
            class="export-type-input"
            data-testid="exportTypeInput"
            :readonly="true"
          />

          <FInput
            :value="substrateAddress"
            class="row"
            size="big"
            data-testid="addressInput"
            :placeholder="placeholderJson"
            :readonly="true"
          />
        </div>

        <FButton size="big" fontSize="big" width="100%" text="Export" data-testid="exportBtn" @click="proceed" />
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
import { exportAccountJSON } from '@/extension/messaging';

@Component
export default class ExportForm extends Vue {
  exportType = 'Restore JSON';
  json: KeyringPair$Json = {} as KeyringPair$Json;
  isLoading = false;

  @Prop(String) password!: string;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;

  get network() {
    return this.$route.params.network ?? this.$route.params.selectedNetwork;
  }

  get placeholderJson() {
    return BaseApi.isEthereumNetwork(this.network) ? 'Ethereum' : 'Substrate';
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
    this.isLoading = true;

    const { json } = await this.keyringPairJson();
    this.json = json;

    this.isLoading = false;
  }

  async keyringPairJson() {
    return exportAccountJSON(this.addressByNetwork, this.password, this.network);
  }

  closeForm() {
    this.$emit('closeHandler', '');
  }

  proceed() {
    this.export();
    this.closeForm();
  }

  async export() {
    const chainId = this.networks.find(({ name }) => name.toLowerCase() === this.network.toLowerCase())!.chainId;
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
