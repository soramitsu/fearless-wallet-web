<template>
  <div>
    <InfoRow
      v-if="isTonWallet || hasSubstrateMnemonic"
      text="accounts.mnemonic"
      iconValue="chevron-right"
      :isHoverRow="true"
      @click="openExport('mnemonic')"
    />

    <InfoRow
      v-if="hasSubstrateMnemonic"
      text="accounts.rawSeed"
      iconValue="chevron-right"
      :isHoverRow="true"
      @click="openExport('rawSeed')"
    />

    <InfoRow
      v-if="!isTonWallet"
      text="accounts.json"
      iconValue="chevron-right"
      :isHoverRow="true"
      @click="openExport('json')"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ExportType } from '@/interfaces';

import { useAccountsStore } from '@/stores/accounts';

const accountsStore = useAccountsStore();
const emit = defineEmits(['setExportType']);

const selectedWallet = computed(() => accountsStore.selectedWallet);
const isTonWallet = computed(() => selectedWallet.value.isTon);

const hasSubstrateMnemonic = computed(
  () => !!(selectedWallet.value.isMasterAccount || selectedWallet.value.haveEntropy)
);

const openExport = (type: ExportType) => emit('setExportType', type);
</script>
