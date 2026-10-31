<template>
  <div>
    <p v-if="selectedWallet.isMnemonicUnverified" role="note" class="json-backup-note">
      {{ $t('accounts.jsonBackupOnly') }}
    </p>
    <InfoRow
      v-if="isTonWallet || hasSubstrateMnemonic"
      text="accounts.mnemonic"
      iconValue="chevron-right"
      :isHoverRow="true"
      @click="openExport('mnemonic')"
    />

    <InfoRow
      v-if="hasSubstrateMnemonic && rawSeedOpensWallet"
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
import { computed, ref, watch } from 'vue';
import type { ExportType } from '@/interfaces';

import { exportRowSeed } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';

const props = defineProps<{ password?: string }>();
const accountsStore = useAccountsStore();
const emit = defineEmits(['setExportType']);

const selectedWallet = computed(() => accountsStore.selectedWallet);
const isTonWallet = computed(() => selectedWallet.value.isTon);

const hasSubstrateMnemonic = computed(
  () => !selectedWallet.value.isMnemonicUnverified && !!(selectedWallet.value.isMasterAccount || selectedWallet.value.haveEntropy)
);

// The raw seed of a wallet made with a derivation path or password opens another account, and the
// background refuses it. It is offered only once the background has exported it for this wallet.
const rawSeedOpensWallet = ref(false);
let rawSeedCheck = 0;

watch(() => [selectedWallet.value.address, hasSubstrateMnemonic.value && !isTonWallet.value, props.password] as const,
  async ([address, hasMnemonic, password]) => {
    const check = ++rawSeedCheck;

    rawSeedOpensWallet.value = false;
    if (!hasMnemonic || !password) return;
    try {
      const { seed } = await exportRowSeed(address, password, false);

      if (check === rawSeedCheck) rawSeedOpensWallet.value = !!seed;
    } catch {
      // Not offered: the background refused it or could not export it.
    }
  }, { immediate: true });

const openExport = (type: ExportType) => emit('setExportType', type);
</script>

<style scoped>
.json-backup-note {
  overflow-wrap: anywhere;
  margin-block: 0 1rem;
  font-size: 0.875rem;
  line-height: 1.4;
}
</style>
