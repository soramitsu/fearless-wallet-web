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
import { type SelectedWallet, useStore } from '@/store';
import { GettersTypes as AccountsGettersTypes } from '@/store/accounts/getters';

const store = useStore();
const emit = defineEmits(['setExportType']);

const selectedWallet = computed<SelectedWallet>(() => store.getters[AccountsGettersTypes.selectedWallet]);
const showMnemonic = computed(() => !!selectedWallet.value.isMasterAccount);

const openExport = (type: ExportType) => emit('setExportType', type);
</script>
