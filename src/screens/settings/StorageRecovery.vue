<template>
  <main class="storage-recovery" data-testid="storageRecovery">
    <header>
      <h1>{{ t('storageRecovery.title') }}</h1>
      <p role="status">{{ t('storageRecovery.description') }}</p>
      <FButton text="storageRecovery.reload" type="secondary" :disabled="reloading" @click="reload" />
      <p v-if="reloadFailed" role="alert">{{ t('ux.startupUnavailable') }}</p>
    </header>
    <Loader v-if="loading" />
    <div v-else-if="failed" role="alert">
      <p>{{ t('accountAccess.loadFailed') }}</p>
      <FButton text="ux.retry" @click="load" />
    </div>
    <p v-else-if="!rows.length">{{ t('storageRecovery.empty') }}</p>
    <section v-for="row in rows" :key="row.address" class="recovery-account" :data-address="row.address">
      <h2>{{ row.name || row.address }}</h2>
      <p class="recovery-account__address">{{ row.address }}</p>
      <template v-if="row.walletEcosystem === WalletEcosystem.Ton">
        <p>{{ t('storageRecovery.tonPassword') }}</p>
        <ValidatedInput :value="row.password" :showPassword="true" placeholder="common.password"
          :readonly="row.busy" @change="setPassword(row, $event)" @pressEnter="reveal(row)" />
        <FButton text="storageRecovery.showPhrase" :disabled="row.busy || !row.password" @click="reveal(row)" />
        <template v-if="row.seed">
          <p>{{ t('storageRecovery.phraseHint') }}</p>
          <p class="recovery-account__phrase" data-testid="recoveryPhrase">{{ row.seed }}</p>
          <FButton text="storageRecovery.hidePhrase" type="secondary" @click="hideSecrets" />
        </template>
      </template>
      <template v-else>
        <p>{{ t('storageRecovery.backupHint') }}</p>
        <FButton text="migration.downloadBackup" :disabled="row.busy" @click="download(row)" />
      </template>
      <p v-if="row.error" role="alert" data-testid="recoveryError">{{ t(row.error) }}</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { StorageRecoveryAccount } from '@extension-base/background/types/types';
import ValidatedInput from '@/components/ValidatedInput.vue';
import { exportMnemonic, getAccessStatus, migrateExportJSON } from '@/extension/messaging';
import { downloadJsonAccount } from '@/helpers/files';
import { WalletEcosystem } from '@/interfaces';
import { useI18n } from '@/locales/useI18n';

type Row = StorageRecoveryAccount & { password: string; seed: string; error: string; busy: boolean };
const { t } = useI18n();
const rows = ref<Row[]>([]);
const loading = ref(true);
const failed = ref(false);
const reloading = ref(false);
const reloadFailed = ref(false);
let disposed = false;
let secretRevision = 0;

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const status = await getAccessStatus();
    if (!disposed) rows.value = (status.storageRecoveryAccounts ?? []).map(account => ({
      ...account, password: '', seed: '', error: '', busy: false,
    }));
  } catch { if (!disposed) failed.value = true; }
  finally { loading.value = false; }
}

function hideSecrets() {
  secretRevision++;
  rows.value.forEach(row => { row.password = ''; row.seed = ''; });
}
function onVisibilityChange() { if (document.hidden) hideSecrets(); }
function setPassword(row: Row, password: string) { row.password = password; row.seed = ''; row.error = ''; }
async function reload() {
  if (reloading.value || disposed) return;
  reloading.value = true;
  reloadFailed.value = false;
  hideSecrets();
  try {
    // A successful recovery-only initialization is cached in the worker. A page
    // refresh alone reuses it, so retire this registration before starting again.
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration && !await registration.unregister()) throw new Error('Worker registration could not be retired');
    if (!disposed) window.location.reload();
  } catch { if (!disposed) reloadFailed.value = true; }
  finally { reloading.value = false; }
}

async function download(row: Row) {
  if (disposed || row.busy) return;
  row.busy = true;
  row.error = '';
  try {
    const { json } = await migrateExportJSON(row.address);
    if (!disposed) downloadJsonAccount(row.address, json);
  } catch { if (!disposed) row.error = 'migration.downloadBackupFailed'; }
  finally { row.busy = false; }
}

async function reveal(row: Row) {
  if (disposed || row.busy || !row.password) return;
  const revision = secretRevision;
  const password = row.password;
  row.password = '';
  row.seed = '';
  row.error = '';
  row.busy = true;
  try {
    const { seed } = await exportMnemonic(row.address, password, WalletEcosystem.Ton);
    if (!seed) throw new Error('Empty recovery phrase');
    if (!disposed && revision === secretRevision) row.seed = seed;
  } catch { if (!disposed && revision === secretRevision) row.error = 'storageRecovery.exportFailed'; }
  finally { row.busy = false; }
}

onMounted(() => { document.addEventListener('visibilitychange', onVisibilityChange); void load(); });
onBeforeUnmount(() => { disposed = true; hideSecrets(); document.removeEventListener('visibilitychange', onVisibilityChange); });
</script>

<style scoped lang="scss">
.storage-recovery {
  max-width: 680px;
  margin-inline: auto;
  text-align: start;
  display: grid;
  gap: 24px;
  padding-block: 16px 32px;
  h1, h2, p { overflow-wrap: anywhere; }
  h1 { font-size: 28px; }
  h2 { font-size: 20px; }
  p { line-height: 1.5; }
  header, .recovery-account { display: grid; gap: 16px; }
  .recovery-account { padding-block: 24px; border-top: 1px solid var(--fw-border, #4e4e57); }
  .recovery-account__address { font-family: monospace; }
  .recovery-account__phrase { padding: 16px; border: 1px solid var(--fw-border, #4e4e57); user-select: all; }
}
</style>
