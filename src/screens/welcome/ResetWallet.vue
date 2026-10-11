<template>
  <AboveForm :fullScreen="true" header="welcome.resetWallet" @closeHandler="close">
    <Scroll>
      <div class="reset-content">
        <div>
          <Icon icon="info-triangle" className="img" />

          <div class="want-reset">{{ t('welcome.wantReset') }}</div>

          <div class="be-deleted">{{ t('welcome.walletWillBeDeleted') }}</div>

          <!-- Accounts that still open only with an earlier per-account password: their backups come first. -->
          <div v-if="legacyAccounts.length" class="reset-backup" data-testid="resetBackupStep">
            <strong>{{ t('welcome.resetBackupTitle') }}</strong>

            <p class="reset-backup__text">
              {{ tc('welcome.resetBackupDescription', legacyAccounts.length, { count: legacyAccounts.length }) }}
            </p>

            <FButton
              size="small"
              fontSize="small"
              width="100%"
              type="secondary"
              text="welcome.resetDownloadBackups"
              :disabled="isDownloading"
              data-testid="resetDownloadBackups"
              @click="downloadBackups"
            />

            <p v-if="backupFailed" class="reset-backup__text" role="alert" data-testid="resetBackupFailed">
              {{ t('migration.downloadBackupFailed') }}
            </p>
            <p v-else-if="backupsDownloaded" class="reset-backup__text" role="status" data-testid="resetBackupDone">
              {{ t('welcome.resetBackupsDownloaded') }}
            </p>

            <Checkbox
              class="reset-backup__own"
              :label="t('welcome.resetHaveBackups')"
              :value="hasOwnBackups"
              data-testid="resetHaveBackups"
              @change="hasOwnBackups = $event"
            />
          </div>

          <div v-if="canConfirm" class="enter-reset">{{ t('welcome.enterReset', { phrase }) }}</div>
        </div>

        <div v-if="canConfirm" data-testid="resetConfirmStep">
          <FInput ref="passInput" size="big" :value="password" :placeholder="phrase" @change="changeOPassword" />

          <FButton
            class="pass"
            size="big"
            fontSize="big"
            width="100%"
            text="common.confirm"
            :disabled="isDisabled"
            @click="reset"
          />
        </div>
      </div>
    </Scroll>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, onMounted, computed } from 'vue';
import type { LegacyPasswordAccountSummary } from '@extension-base/background/types/types';
import { useI18n } from '@/locales/useI18n';
import FInput from '@/components/FInput.vue';
import { getMigrationAccounts, migrateExportJSON, resetWallet } from '@/extension/messaging';
import { downloadJsonAccount } from '@/helpers/files';
import { Components } from '@/router/routes';

const phrase = 'Reset wallet';
const router = useRouter();
const { t, tc } = useI18n();

const password = ref('');
const passInput = ref<InstanceType<typeof FInput> | null>(null);
// Accounts no master password has ever opened. Reset removes them like every other account, so the typed
// confirmation waits until their encrypted backups were downloaded or the user says they have their own.
const legacyAccounts = ref<LegacyPasswordAccountSummary[]>([]);
const isDownloading = ref(false);
const backupsDownloaded = ref(false);
const backupFailed = ref(false);
const hasOwnBackups = ref(false);

const canConfirm = computed(() => !legacyAccounts.value.length || backupsDownloaded.value || hasOwnBackups.value);
const isDisabled = computed(() => !canConfirm.value || password.value !== phrase);

onMounted(async () => {
  // Reset has to stay possible when the list cannot be read (for example with a forgotten master password).
  legacyAccounts.value = await getMigrationAccounts().catch(() => []);

  passInput.value?.input?.focus();
});

// Each file is the stored record as it is and still opens with the password its account had.
const downloadBackups = async () => {
  if (isDownloading.value) return;

  isDownloading.value = true;
  backupFailed.value = false;

  try {
    for (const { address } of legacyAccounts.value) {
      const { json } = await migrateExportJSON(address);

      downloadJsonAccount(address, json);
    }

    backupsDownloaded.value = true;
  } catch {
    backupFailed.value = true;
  } finally {
    isDownloading.value = false;
  }
};

const changeOPassword = async (pass: string) => (password.value = pass);
const close = () => router.back();

const reset = () => {
  resetWallet();

  router.push({ name: Components.Welcome });
};
</script>

<style lang="scss" scoped>
.pass {
  margin-top: 14px;
}

.reset-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: center;

  .want-reset {
    font-size: 20px;
    font-weight: 700;
  }

  .be-deleted {
    color: $gray-color;
    margin: 25px 0;
  }

  .enter-reset {
    font-weight: 700;
  }

  .reset-backup {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 25px;
    padding: 12px;
    border: $default-border;
    border-radius: $default-border-radius;
    text-align: left;
  }

  .reset-backup__text {
    margin: 0;
    color: $grayish-white;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .reset-backup__own {
    font-size: 0.8rem;
  }

  .img {
    margin-bottom: 30px;
    width: 85px;
    height: 85px;
  }
}
</style>
