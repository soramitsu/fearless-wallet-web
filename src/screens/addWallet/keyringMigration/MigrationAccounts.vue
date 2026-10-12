<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="true"
    header="migration.upgradeKeyStorage"
    @handlerBack="back"
    :showCloseIcon="false"
  >
    <Scroll>
      <div class="accounts-migration">
        <div>
          <div v-if="loadError" class="accounts-migration__notice" role="alert" data-testid="migrationLoadFailed">
            <span>{{ t('migration.loadFailed') }}</span>
            <FButton text="ux.retry" size="small" fontSize="small" type="secondary" @click="loadAccounts" />
          </div>

          <BackupWalletsList
            :items="files"
            descriptionKey="migration.enterPassRow"
            @setItemValue="setItemValue"
            @setItemPassword="setItemPassword"
          >
            <template #rowActions="{ file }">
              <div v-if="!file.isComplete" class="row-actions">
                <button type="button" class="text-link" data-testid="downloadBackup" @click="downloadBackup(file)">
                  {{ t('migration.downloadBackup') }}
                </button>
                <button type="button" class="text-link" data-testid="usePhrase" @click="usePhrase(file)">
                  {{ t('migration.usePhrase') }}
                </button>
              </div>
            </template>
          </BackupWalletsList>
        </div>

        <div class="accounts-migration__footer">
          <div class="controls">
            <FButton
              v-if="showSkip"
              text="migration.skipForNow"
              type="secondary"
              width="100%"
              size="big"
              :disabled="isMigrationInProgress"
              data-testid="migrationSkip"
              @click="showSkipPopup = true"
            />

            <FButton
              text="common.continue"
              width="100%"
              size="big"
              :disabled="isDisabledContinue"
              data-testid="migrationContinue"
              @click="proceed"
            />
          </div>

          <!-- Reset deletes accounts, so it is never next to Continue and Skip (which keep every account). -->
          <div class="more-options">
            <button
              type="button"
              class="text-link"
              :aria-expanded="showMoreOptions"
              data-testid="moreOptions"
              @click="showMoreOptions = !showMoreOptions"
            >
              {{ t('migration.moreOptions') }}
            </button>

            <div v-if="showMoreOptions" class="more-options__content" data-testid="moreOptionsContent">
              <p class="more-options__hint">{{ t('migration.resetHint') }}</p>
              <button type="button" class="text-link" data-testid="resetWalletLink" @click="openReset">
                {{ t('welcome.resetWallet') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <NotificationPopup
        v-if="showSkipPopup"
        acceptButtonText="migration.skipForNow"
        rejectButtonText="common.cancel"
        sizeWidth="big"
        :showAcceptButton="true"
        :showRejectButton="true"
        :showWarningIcon="false"
        :closeByBackground="false"
        :headers="skipHeaders"
        @handlerClose="showSkipPopup = false"
        @handlerAccept="skip"
      />
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, computed, onMounted } from 'vue';
import type { LegacyPasswordAccountSummary } from '@extension-base/background/types/types';
import type { FilesState } from '@/interfaces';
import { Components } from '@/router/routes';
import BackupWalletsList from '@/screens/addWallet/BackupWalletsList.vue';
import {
  deferLegacyPasswordMigration,
  getMigrationAccounts,
  hasMasterPassword,
  migrateExportJSON,
} from '@/extension/messaging';
import { downloadJsonAccount } from '@/helpers/files';
import { useI18n } from '@/locales/useI18n';
import { useNotify } from '@/plugins/soramitsuUI';

const skipHeaders = { text: 'migration.skipConfirmTitle', subtext: 'migration.skipWarning' };

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();
const files = ref<FilesState[]>([]);
const isLoading = ref(true);
const loadError = ref(false);
const hasMasterPass = ref(false);
const showSkipPopup = ref(false);
const showMoreOptions = ref(false);
const isSkipping = ref(false);
const isAllAccountComplete = computed(() => files.value.every(({ isComplete }) => isComplete));
const isMigrationInProgress = computed(() => files.value.some((file) => file.isLoading));
const isDisabledContinue = computed(() => isLoading.value || loadError.value || !isAllAccountComplete.value);
// One forgotten password must not keep the other accounts closed. Skipping needs the master password that
// opens the wallet; the accounts left behind stay in the wallet and are listed in Account access.
const showSkip = computed(
  () => hasMasterPass.value && !isLoading.value && (loadError.value || !isAllAccountComplete.value)
);

// An account's own Ethereum account has no name of its own.
const rowName = ({ name, linkedParentAddress, linkedParentName }: LegacyPasswordAccountSummary): string =>
  linkedParentAddress ? t('accountAccess.evmAccountOf', { name: linkedParentName || linkedParentAddress }) : name;

const loadAccounts = async () => {
  isLoading.value = true;
  loadError.value = false;
  try {
    const accounts = await getMigrationAccounts();
    files.value = accounts.map((account) => ({
      name: rowName(account),
      address: account.address,
      password: '',
      isComplete: false,
      isLoading: false,
      isError: false,
      active: false,
    }));
  } catch {
    loadError.value = true;
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  const hasPassword = await hasMasterPassword().catch(() => undefined);

  // Nothing here can be stored before the master password exists; the description screen leads to creating it.
  if (hasPassword === false) {
    router.replace({ name: Components.MigrationDescription });

    return;
  }

  hasMasterPass.value = hasPassword === true;

  await loadAccounts();
});

// One password can open more than one key (an account and its Ethereum account), so rows that no longer
// wait are done as well. A linked account with a different password keeps its own row.
const markMigratedRows = async () => {
  const pending = await getMigrationAccounts().catch(() => undefined);

  if (!pending) return;

  files.value = files.value.map((file) =>
    file.isComplete || pending.some(({ address }) => address === file.address)
      ? file
      : { ...file, isComplete: true, isError: false }
  );
};

const setItemValue = (index: number, data: Record<string, unknown>) => {
  files.value.splice(index, 1, { ...files.value[index], ...data });

  if (data.isComplete) void markMigratedRows();
};

const setItemPassword = (index: number, password: string) => {
  files.value.splice(index, 1, { ...files.value[index], password });
};

// The record exactly as it is stored: it still opens only with the account's old password, so
// downloading it changes nothing in the wallet.
const downloadBackup = async ({ address }: FilesState) => {
  try {
    const { json } = await migrateExportJSON(address);

    downloadJsonAccount(address, json);
  } catch {
    notify({ title: t('migration.downloadBackupFailed'), message: '', type: 'error' });
  }
};

const usePhrase = ({ address }: FilesState) =>
  router.push({ name: Components.AccountAccessRecovery, query: { address, mode: 'phrase' } });

// Skipping only postpones the prompt. No account is removed and no key is touched.
const skip = async () => {
  if (isSkipping.value) return;

  isSkipping.value = true;

  const deferred = await deferLegacyPasswordMigration().catch(() => false);

  isSkipping.value = false;
  showSkipPopup.value = false;

  if (deferred) router.push({ name: Components.Wallet });
  else notify({ title: t('migration.skipFailed'), message: '', type: 'error' });
};

const back = () => router.back();
const proceed = () => router.push({ name: Components.Wallet });
const openReset = () => router.push({ name: Components.ResetWallet });
</script>

<style lang="scss" scoped>
.accounts-migration {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  height: 100%;
}

.accounts-migration__notice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
  padding: 12px;
  border: $default-border;
  border-radius: $default-border-radius;
  color: $grayish-white;
  font-size: 0.8rem;
  line-height: 1.4;
  text-align: left;
}

.accounts-migration__footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.controls {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  width: 100%;
  margin-top: 8px;
}

.text-link {
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid palette($pink-lavender-color, var(--fw-focus));
    outline-offset: 2px;
  }
}

.more-options {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  text-align: left;
}

.more-options__content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.more-options__hint {
  margin: 0;
  color: $grayish-white;
  font-size: 0.75rem;
  line-height: 1.35;
}
</style>
