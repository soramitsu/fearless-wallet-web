<template>
  <div class="export-form">
    <Loader v-if="isLoading" />

    <template v-else>
      <div class="export-content">
        <div v-if="isMnemonic">
          <MnemonicBackupForm :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength">
            <Hint
              v-if="isPhraseAsTyped"
              class="as-typed-hint"
              iconName="warning"
              text="ux.tonPhraseAsTyped"
              role="note"
              data-testid="tonPhraseAsTyped"
            />
          </MnemonicBackupForm>
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
import { defineComponent } from 'vue';


import type { KeyringPair$Json } from '@subwallet/keyring/types';
import BaseApi from '@/util/BaseApi';
import { exportJSON, exportMnemonic, exportRowSeed } from '@/extension/messaging';
import { WalletEcosystem } from '@/interfaces';
import { isSameString, setClipboard } from '@/helpers';
import { downloadJsonAccount } from '@/helpers/files';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';
import { isTonPhraseIrregular } from '@/util/tonKeyring';

enum ExportTypeTextKey {
  mnemonic = 'accounts.mnemonic',
  rawSeed = 'accounts.rawSeed',
  json = 'accounts.json',
}

export default defineComponent({ name: 'ExportForm', components: { MnemonicBackupForm } ,
  props: {
    password: String,
    exportType: String,
  },
  data() {
    return {
      networksStore: useNetworksStore(),
      accountsStore: useAccountsStore(),
      json: {} as KeyringPair$Json,
      isLoading: false,
      seed: '',
    };
  },
  computed: {
    exportTypeText() {
      return this.$t(ExportTypeTextKey[this.exportType]);
    },
    mnemonicLength() {
      return this.mnemonicArray.length;
    },
    mnemonicArray() {
      return this.seed.split(' ');
    },
    isMnemonic() {
      return this.exportType === 'mnemonic';
    },
    // A TON phrase stored with its own spacing and capitals is shown and copied exactly as stored, and
    // only opens the wallet when typed that way.
    isPhraseAsTyped() {
      return this.accountsStore.selectedWallet.walletEcosystem === WalletEcosystem.Ton && isTonPhraseIrregular(this.seed);
    },
    isRowSeed() {
      return this.exportType === 'rawSeed';
    },
    isJson() {
      return this.exportType === 'json';
    },
    network() {
      return this.$route.params.network ?? this.$route.params.selectedNetwork;
    },
    text() {
      return this.isJson ? 'accounts.downloadFile' : 'common.copyToClipboard';
    },
    isEthereumNetwork() {
      return BaseApi.isEthereumNetwork(this.network);
    },
    placeholder() {
      return this.isEthereumNetwork ? 'Ethereum' : 'Substrate';
    },
    substrateAddress() {
      const json = Object.entries(this.json)
            .sort(([key]) => (key === 'address' ? -1 : 0))
            .reduce((result, [key, value]) => ({ ...result, [key]: value }), {});

          return JSON.stringify(json);
    },
    addressByNetwork() {
      return BaseApi.formatAddress(this.accountsStore.selectedWallet, this.network);
    },
  },
  async mounted() {
    this.isLoading = true;

        if (this.isMnemonic) {
          const { address, walletEcosystem } = this.accountsStore.selectedWallet;
          const { seed } = await exportMnemonic(address, this.password, walletEcosystem);

          this.seed = seed;
        } else if (this.isRowSeed) {
          const { seed } = await exportRowSeed(this.addressByNetwork, this.password, this.isEthereumNetwork);

          this.seed = seed;
        } else {
          const { json } = await exportJSON(this.addressByNetwork, this.password, this.network);

          this.json = json;
        }

        this.isLoading = false;
  },
  methods: {
    proceed() {
      if (this.isMnemonic || this.isRowSeed) setClipboard(this.seed);
          else this.downloadJsonFile();
    },
    async downloadJsonFile() {
      const chainId = this.networksStore.networks.find(({ name }) => isSameString(name, this.network))!.chainId;
          const meta = { ...this.json.meta, genesisHash: `0x${chainId}` } as unknown as Record<string, string>;

          downloadJsonAccount(this.addressByNetwork, this.json, meta);
    },
  },
});
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

  .as-typed-hint {
    border-radius: $default-border-radius;
    padding: 8px 16px;
    background-color: rgba(255, 255, 255, 0.24);
  }
}
</style>
