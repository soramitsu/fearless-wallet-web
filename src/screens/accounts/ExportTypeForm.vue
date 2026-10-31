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
import { computed, onDeactivated, onMounted, ref, watch } from 'vue';
import type { ExportType } from '@/interfaces';

import { rawSeedAvailable } from '@/extension/messaging';
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
// background refuses it. It is offered only when the background answers that it opens this wallet;
// that answer never carries the seed.
const rawSeedOpensWallet = ref(false);
let rawSeedCheck = 0;

// Also discards an answer still on its way.
const dropRawSeedAnswer = () => {
  rawSeedCheck += 1;
  rawSeedOpensWallet.value = false;
};

// Asked once, for the wallet the password was just entered for.
onMounted(async () => {
  const check = rawSeedCheck;

  if (!hasSubstrateMnemonic.value || isTonWallet.value || !props.password) return;
  try {
    const available = await rawSeedAvailable(selectedWallet.value.address, props.password);

    if (check === rawSeedCheck) rawSeedOpensWallet.value = available === true;
  } catch {
    // Not offered: the background could not confirm it.
  }
});

// Another wallet, a cleared password or leaving the screen drops the answer for good. The password
// stays with the parent; nothing here keeps it or asks again with it.
watch([() => selectedWallet.value.address, () => !!props.password], dropRawSeedAnswer);
onDeactivated(dropRawSeedAnswer);

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
