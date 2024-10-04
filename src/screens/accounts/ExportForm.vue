<template>
  <div class="export-form">
    <Loader v-if="isLoading" />

    <template v-else>
      <div class="export-content">
        <div v-if="isMnemonic">
          <MnemonicBackupForm :mnemonicArray="mnemonicArray"></MnemonicBackupForm>
        </div>

        <template v-else>
          <FInput
            :value="exportTypeText"
            placeholder="common.sourceType"
            size="big"
            class="export-type-input"
            data-testid="exportTypeInput"
            :readonly="true"
          />

          <FInput
            :value="isRowSeed ? seed : substrateAddress"
            class="row"
            size="big"
            data-testid="addressInput"
            :placeholder="placeholder"
            :readonly="true"
          />
        </template>
      </div>

      <FButton size="big" fontSize="big" width="100%" :text="text" data-testid="exportBtn" @click="proceed" />
    </template>
  </div>
</template>

<script lang="ts">
import { Getter } from 'vuex-class';
import { saveAs } from 'file-saver';
import { Vue, Component, Prop } from 'vue-property-decorator';
import type { SelectedWallet } from '@/store';
import type { Networks } from '@/interfaces/networks';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { ExportType } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { exportJSON, exportMnemonic, exportRowSeed } from '@/extension/messaging';
import { setClipboard } from '@/helpers';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';

enum ExportTypeText {
  mnemonic = 'Mnemonic',
  rawSeed = 'Raw seed',
  json = 'JSON',
}

@Component({ components: { MnemonicBackupForm } })
export default class ExportForm extends Vue {
  json: KeyringPair$Json = {} as KeyringPair$Json;
  isLoading = false;
  seed = '';

  @Prop(String) password!: string;
  @Prop(String) exportType!: ExportType;
  @Getter(AccountsGettersTypes.selectedWallet) selectedWallet!: SelectedWallet;
  @Getter(NetworksGettersTypes.allNetworks) networks!: Networks;

  get exportTypeText() {
    return ExportTypeText[this.exportType];
  }

  get mnemonicArray() {
    return this.seed.split(' ');
  }

  get isMnemonic() {
    return this.exportType === 'mnemonic';
  }

  get isRowSeed() {
    return this.exportType === 'rawSeed';
  }

  get isJson() {
    return this.exportType === 'json';
  }

  get network() {
    return this.$route.params.network ?? this.$route.params.selectedNetwork;
  }

  get text() {
    return this.isJson ? 'accounts.downloadFile' : 'common.copyToClipboard';
  }

  get placeholder() {
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

    if (this.isMnemonic) {
      const { seed } = await exportMnemonic(this.selectedWallet.address, this.password);

      this.seed = seed;
    } else if (this.isRowSeed) {
      const { seed } = await exportRowSeed(this.addressByNetwork, this.password);

      this.seed = seed;
    } else {
      const { json } = await exportJSON(this.addressByNetwork, this.password, this.network);

      this.json = json;
    }

    this.isLoading = false;
  }

  proceed() {
    if (this.isMnemonic || this.isRowSeed) setClipboard(this.seed);
    else this.downloadJsonFile();
  }

  async downloadJsonFile() {
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
