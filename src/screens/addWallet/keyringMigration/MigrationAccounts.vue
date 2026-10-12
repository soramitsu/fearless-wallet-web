<template>
  <AboveForm
    :fullScreen="true"
    :showBackIcon="!isBusy"
    header="migration.upgradeKeyStorage"
    @handlerBack="back"
    :showCloseIcon="false"
  >
    <Scroll>
      <div class="accounts-migration" :aria-busy="isLoading || isBusy">
        <p v-if="isLoading || isBusy" role="status" aria-live="polite">{{ t('migration.pending') }}</p>
        <div>
          <div v-if="loadError" class="accounts-migration__notice" role="alert" data-testid="migrationLoadFailed">
            <span>{{ t('migration.loadFailed') }}</span>
            <FButton text="ux.retry" size="small" fontSize="small" type="secondary" @click="loadAccounts" />
          </div>

          <BackupWalletsList
            :items="files"
            :disabled="isLoading || loadError || isSkipping || isNavigating || downloading.size > 0"
            descriptionKey="migration.enterPassRow"
            @setItemValue="setItemValue"
            @setItemPassword="setItemPassword"
          >
            <template #rowActions="{ file }">
              <div v-if="!file.isComplete" class="row-actions">
                <button
                  type="button"
                  class="text-link"
                  :disabled="isBusy || isLoading"
                  data-testid="downloadBackup"
                  @click="downloadBackup(file)"
                >
                  {{ t('migration.downloadBackup') }}
                </button>
                <button
                  type="button"
                  class="text-link"
                  :disabled="isBusy || isLoading"
                  data-testid="usePhrase"
                  @click="usePhrase(file)"
                >
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
              :disabled="isBusy"
              :loading="isSkipping"
              data-testid="migrationSkip"
              @click="openSkip"
            />

            <FButton
              text="common.continue"
              width="100%"
              size="big"
              :disabled="isDisabledContinue"
              :focusableWhenDisabled="true"
              :disabledReason="continueReason"
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
              <button
                type="button"
                class="text-link"
                data-testid="resetWalletLink"
                :disabled="isBusy || isLoading"
                @click="openReset"
              >
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
        :showAcceptButton="false"
        :showRejectButton="false"
        :showWarningIcon="false"
        :showHeader="!isSkipping"
        :closeByBackground="false"
        :headers="skipHeaders"
        @handlerClose="closeSkip"
        @handlerAccept="skip"
      >
        <p v-if="isSkipping" role="status" aria-live="polite">{{ t('migration.pending') }}</p>
        <div class="controls">
          <FButton
            text="migration.skipForNow"
            :disabled="isSkipping"
            :loading="isSkipping"
            data-testid="acceptBtn"
            @click="skip"
          />
          <FButton
            text="common.cancel"
            type="secondary"
            :disabled="isSkipping"
            data-testid="closeBtn"
            @click="closeSkip"
          />
        </div>
      </NotificationPopup>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
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
const isNavigating = ref(false);
const downloading = ref(new Set<string>());
let active = true;
let loadPending = false;
let inventoryRevision = 0;
let reconciliationRequest = 0;
onBeforeUnmount(() => {
  active = false;
  inventoryRevision += 1;
  reconciliationRequest += 1;
});
const isAllAccountComplete = computed(() => files.value.every(({ isComplete }) => isComplete));
const isMigrationInProgress = computed(() => files.value.some((file) => file.isLoading));
const isBusy = computed(
  () => isMigrationInProgress.value || isSkipping.value || isNavigating.value || downloading.value.size > 0
);
const isDisabledContinue = computed(
  () => isLoading.value || loadError.value || isBusy.value || !isAllAccountComplete.value
);
const continueReason = computed(() =>
  isLoading.value || isBusy.value
    ? 'migration.pending'
    : loadError.value
      ? 'migration.loadFailed'
      : 'migration.enterPassRow'
);
// One forgotten password must not keep the other accounts closed. Skipping needs the master password that
// opens the wallet; the accounts left behind stay in the wallet and are listed in Account access.
const showSkip = computed(
  () => hasMasterPass.value && !isLoading.value && (loadError.value || !isAllAccountComplete.value)
);

// An account's own Ethereum account has no name of its own.
const rowName = ({ name, linkedParentAddress, linkedParentName }: LegacyPasswordAccountSummary): string =>
  linkedParentAddress ? t('accountAccess.evmAccountOf', { name: linkedParentName || linkedParentAddress }) : name;

const loadAccounts = async () => {
  if (!active || loadPending || isBusy.value) return;
  loadPending = true;
  isLoading.value = true;
  loadError.value = false;
  try {
    const hasPassword = await hasMasterPassword();
    if (!active) return;
    hasMasterPass.value = hasPassword;
    if (!hasPassword) {
      await router.replace({ name: Components.MigrationDescription });
      return;
    }
    const accounts = await getMigrationAccounts();
    if (!active) return;
    inventoryRevision += 1;
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
    if (active) loadError.value = true;
  } finally {
    loadPending = false;
    if (active) isLoading.value = false;
  }
};

onMounted(loadAccounts);

// One password can open more than one key (an account and its Ethereum account), so rows that no longer
// wait are done as well. A linked account with a different password keeps its own row.
const markMigratedRows = async () => {
  const revision = inventoryRevision;
  const request = ++reconciliationRequest;
  const pending = await getMigrationAccounts().catch(() => undefined);

  if (!active || !pending || revision !== inventoryRevision || request !== reconciliationRequest) return;

  files.value = files.value.map((file) =>
    file.isComplete || pending.some(({ address }) => address === file.address)
      ? file
      : { ...file, isComplete: true, isError: false }
  );
};

const setItemValue = (index: number, data: Record<string, unknown>) => {
  if (!active || !files.value[index]) return;
  files.value.splice(index, 1, { ...files.value[index], ...data });

  if (data.isComplete) void markMigratedRows();
};

const setItemPassword = (index: number, password: string) => {
  if (
    !active ||
    isLoading.value ||
    isSkipping.value ||
    isNavigating.value ||
    !files.value[index] ||
    files.value[index].isLoading ||
    files.value[index].isComplete
  )
    return;
  files.value.splice(index, 1, { ...files.value[index], password });
};

// The record exactly as it is stored: it still opens only with the account's old password, so
// downloading it changes nothing in the wallet.
const downloadBackup = async ({ address }: FilesState) => {
  if (
    !active ||
    isBusy.value ||
    isLoading.value ||
    !files.value.some((file) => file.address === address && !file.isComplete)
  )
    return;
  downloading.value.add(address);
  try {
    const { json } = await migrateExportJSON(address);
    if (active && files.value.some((file) => file.address === address)) downloadJsonAccount(address, json);
  } catch {
    if (active) notify({ title: t('migration.downloadBackupFailed'), message: '', type: 'error' });
  } finally {
    downloading.value.delete(address);
  }
};

const navigate = async (destination: Parameters<typeof router.push>[0]) => {
  if (!active || isBusy.value || isLoading.value) return;
  isNavigating.value = true;
  try {
    await router.push(destination);
  } catch {
    if (active) notify({ title: t('ux.startupUnavailable'), message: '', type: 'error' });
  } finally {
    if (active) isNavigating.value = false;
  }
};
const usePhrase = ({ address }: FilesState) => {
  if (!files.value.some((file) => file.address === address && !file.isComplete)) return;
  return navigate({ name: Components.AccountAccessRecovery, query: { address, mode: 'phrase' } });
};
const openSkip = () => {
  if (active && showSkip.value && !isBusy.value) showSkipPopup.value = true;
};
const closeSkip = () => {
  if (!isSkipping.value) showSkipPopup.value = false;
};
// Skipping only postpones the prompt. No account is removed and no key is touched.
const skip = async () => {
  if (!active || !showSkipPopup.value || !showSkip.value || isBusy.value) return;
  isSkipping.value = true;
  let deferred = false;
  try {
    deferred = await deferLegacyPasswordMigration();
    if (!active) return;
    if (!deferred) throw new Error('Deferral not saved');
    await router.push({ name: Components.Wallet });
  } catch {
    if (active) notify({ title: t(deferred ? 'ux.startupUnavailable' : 'migration.skipFailed'), message: '', type: 'error' });
  } finally {
    if (active) {
      isSkipping.value = false;
      showSkipPopup.value = false;
    }
  }
};
const back = () => {
  if (active && !isBusy.value) router.back();
};
const proceed = () => {
  if (!isDisabledContinue.value) return navigate({ name: Components.Wallet });
};
const openReset = () => navigate({ name: Components.ResetWallet });
</script>

<style lang="scss" scoped>
.accounts-migration {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  min-height: 100%;
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
  flex-wrap: wrap;
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
  padding: 8px 0;
  min-height: 44px;
  overflow-wrap: anywhere;
  border: 0;
  background: transparent;
  color: $pink-lavender-color;
  font: inherit;
  font-size: 0.75rem;
  text-align: left;
  cursor: pointer;

  &:disabled {
    opacity: 0.65;
    cursor: default;
  }

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
