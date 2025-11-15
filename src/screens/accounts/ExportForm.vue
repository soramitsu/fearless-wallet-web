<template>
  <div class="export-form">
    <Loader v-if="isLoading" />

    <template v-else>
      <div class="export-content">
        <div v-if="isMnemonic">
          <MnemonicBackupForm :mnemonicArray="mnemonicArray" :mnemonicLength="mnemonicLength"></MnemonicBackupForm>
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

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { KeyringPair$Json } from '@subwallet/keyring/types';
import type { ExportType } from '@/interfaces';
import BaseApi from '@/util/BaseApi';
import { exportJSON, exportMnemonic, exportRowSeed } from '@/extension/messaging';
import { isSameString, setClipboard } from '@/helpers';
import { downloadJsonAccount } from '@/helpers/files';
import MnemonicBackupForm from '@/screens/addWallet/MnemonicBackupForm.vue';
import { useNetworksStore } from '@/stores/networks';
import { useAccountsStore } from '@/stores/accounts';

enum ExportTypeText {
  mnemonic = 'Mnemonic',
  rawSeed = 'Raw seed',
  json = 'JSON',
}

defineOptions({
  name: 'ExportForm',
});

const props = defineProps<{
  password: string;
  exportType: ExportType;
}>();

const route = useRoute();
const networksStore = useNetworksStore();
const accountsStore = useAccountsStore();

const json = ref<KeyringPair$Json>({} as KeyringPair$Json);
const isLoading = ref(false);
const seed = ref('');

const network = computed(() => (route.params.network ?? route.params.selectedNetwork) as string | undefined);

const isMnemonic = computed(() => props.exportType === 'mnemonic');
const isRowSeed = computed(() => props.exportType === 'rawSeed');
const isJson = computed(() => props.exportType === 'json');

const exportTypeText = computed(() => ExportTypeText[props.exportType]);

const mnemonicArray = computed(() => seed.value.split(' ').filter((word) => word.length > 0));
const mnemonicLength = computed(() => mnemonicArray.value.length);

const addressByNetwork = computed(() => BaseApi.formatAddress(accountsStore.selectedWallet, network.value));
const isEthereumNetwork = computed(() => BaseApi.isEthereumNetwork(network.value));

const placeholder = computed(() => (isEthereumNetwork.value ? 'Ethereum' : 'Substrate'));
const text = computed(() => (isJson.value ? 'accounts.downloadFile' : 'common.copyToClipboard'));

const substrateAddress = computed(() => {
  const sorted = Object.entries(json.value)
    .sort(([key]) => (key === 'address' ? -1 : 0))
    .reduce<Record<string, unknown>>((result, [key, value]) => ({ ...result, [key]: value }), {});

  return JSON.stringify(sorted);
});

const proceed = () => {
  if (isMnemonic.value || isRowSeed.value) {
    setClipboard(seed.value);
  } else {
    downloadJsonFile();
  }
};

const downloadJsonFile = () => {
  const networkDetails = networksStore.networks.find(({ name }) => isSameString(name, network.value ?? ''));

  if (!networkDetails) return;

  const chainId = networkDetails.chainId;
  const meta = { ...json.value.meta, genesisHash: `0x${chainId}` } as unknown as Record<string, string>;

  downloadJsonAccount(addressByNetwork.value, json.value, meta);
};

onMounted(async () => {
  isLoading.value = true;

  if (isMnemonic.value) {
    const { address, walletEcosystem } = accountsStore.selectedWallet;
    const { seed: exportedSeed } = await exportMnemonic(address, props.password, walletEcosystem);

    seed.value = exportedSeed;
  } else if (isRowSeed.value) {
    const { seed: exportedSeed } = await exportRowSeed(addressByNetwork.value, props.password, isEthereumNetwork.value);

    seed.value = exportedSeed;
  } else {
    const { json: exportedJson } = await exportJSON(addressByNetwork.value, props.password, network.value);

    json.value = exportedJson;
  }

  isLoading.value = false;
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
}
</style>
