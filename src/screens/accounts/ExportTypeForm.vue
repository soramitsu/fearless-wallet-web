<template>
  <div>
    <template v-if="showMnemonic">
      <InfoRow text="accounts.mnemonic" iconValue="chevron-right" :isHoverRow="true" @click="openExport('mnemonic')" />

      <InfoRow text="accounts.rawSeed" iconValue="chevron-right" :isHoverRow="true" @click="openExport('rawSeed')" />
    </template>

    <InfoRow text="accounts.json" iconValue="chevron-right" :isHoverRow="true" @click="openExport('json')" />
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import type { ExportType } from '@/interfaces';

import { useAccountsStore } from '@/stores/accounts';

const accountsStore = useAccountsStore();
const emit = defineEmits(['setExportType']);

const selectedWallet = computed(() => accountsStore.selectedWallet);
const showMnemonic = computed(() => !!(selectedWallet.value.isMasterAccount || selectedWallet.value.haveEntropy));

const openExport = (type: ExportType) => emit('setExportType', type);
</script>
