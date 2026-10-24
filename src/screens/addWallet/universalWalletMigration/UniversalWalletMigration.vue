<template>
  <AboveForm
    :fullScreen="true"
    :header="snapshot.legacyVaults.length ? 'migration.universalWalletRequired' : 'ux.walletTaskTitle'"
    :showCloseIcon="false"
  >
    <div class="universal-migration" :aria-busy="isLoading || !!isOpening">
      <div v-if="loadError" role="alert" class="universal-migration__error" data-testid="migrationLoadFailed">
        <p>{{ t('migration.loadFailed') }}</p>
        <FButton text="ux.retry" type="secondary" @click="loadSnapshot" />
      </div>
      <div v-if="!isLoading && !loadError">
        <div class="universal-migration__title">
          {{ t(snapshot.legacyVaults.length ? 'migration.universalWalletActionRequired' : 'ux.walletTaskDescription') }}
        </div>
        <div class="universal-migration__text">
          {{
            t(
              snapshot.legacyVaults.length
                ? 'migration.universalWalletLegacyText'
                : 'migration.universalWalletEmptyText'
            )
          }}
        </div>

        <div v-if="snapshot.legacyVaults.length" class="universal-migration__legacy">
          <div v-for="vault in snapshot.legacyVaults" :key="vault.vaultId" class="universal-migration__vault">
            <div class="universal-migration__vault-name">
              {{ vault.displayName || vault.ecosystem }}
            </div>
            <div class="universal-migration__vault-address">
              {{ cut(vault.address) }}
            </div>
            <FButton
              class="universal-migration__vault-export"
              text="migration.exportLegacyVault"
              size="small"
              type="secondary"
              :border="false"
              :disabled="!canExportVault(vault) || !!isOpening"
              :focusableWhenDisabled="!isOpening"
              :disabledReason="!canExportVault(vault) ? 'migration.exportLegacyVaultUnavailable' : ''"
              @click="exportLegacyVault(vault)"
            />
            <div v-if="exportFailureVaultId === vault.vaultId" class="universal-migration__vault-error" role="alert">
              {{ t('migration.exportLegacyVaultUnavailable') }}
            </div>
          </div>
        </div>
      </div>

      <div class="universal-migration__controls">
        <p v-if="openError" role="alert" data-testid="migrationOpenFailed">{{ t('migration.loadFailed') }}</p>
        <FButton
          text="migration.createUniversalWallet"
          size="big"
          :disabled="isLoading || loadError || !!isOpening"
          :loading="isOpening === 'create'"
          @click="createWallet"
        />
        <FButton
          text="migration.importUniversalWallet"
          type="secondary"
          size="big"
          :border="false"
          :disabled="isLoading || loadError || !!isOpening"
          :loading="isOpening === 'import'"
          @click="importWallet"
        />
        <RecoveryDataLink />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import AboveForm from '@/components/AboveForm.vue';
import RecoveryDataLink from '@/components/RecoveryDataLink.vue';
import { Components } from '@/router/routes';
import { getUniversalWalletMigrationSnapshot, hasMasterPassword } from '@/extension/messaging';
import { WalletEcosystem } from '@/interfaces';
import { cut } from '@/helpers';
import { useI18n } from '@/locales/useI18n';
import { useAccountsStore } from '@/stores/accounts';
import { resolveUniversalWalletLegacyExportTarget } from '@/util/universalWalletLegacyExport';
import {
  UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  type UniversalWalletLegacyVaultDescriptor,
  type UniversalWalletMigrationSnapshot,
} from '@/util/universalWalletMigrationContract';
import { WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS } from '@/util/universalWalletKeyringMigration';

const router = useRouter();
const { t } = useI18n();
const accountsStore = useAccountsStore();
const exportFailureVaultId = ref<string | null>(null);
const isLoading = ref(true);
const loadError = ref(false);
const openError = ref(false);
const isOpening = ref<'create' | 'import' | null>(null);
let active = true;
let snapshotRequestPending = false;
onBeforeUnmount(() => {
  active = false;
});

const snapshot = ref<UniversalWalletMigrationSnapshot>({
  schemaVersion: UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  platform: 'web',
  hasUniversalWallet: false,
  legacyVaults: [],
  cutoffAtMillis: WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS,
  evaluatedAtMillis: Date.now(),
});

const loadSnapshot = async () => {
  if (!active || snapshotRequestPending) return;
  snapshotRequestPending = true;
  isLoading.value = true;
  loadError.value = false;
  try {
    const value = await getUniversalWalletMigrationSnapshot();
    if (active) snapshot.value = value;
  } catch {
    if (active) loadError.value = true;
  } finally {
    snapshotRequestPending = false;
    if (active) isLoading.value = false;
  }
};
onMounted(loadSnapshot);

const openAddWallet = async (type: 'create' | 'import') => {
  if (!active || isLoading.value || loadError.value || isOpening.value) return;
  isOpening.value = type;
  openError.value = false;
  try {
    const hasPassword = await hasMasterPassword();
    if (!active) return;
    await router.push(
      hasPassword
        ? {
            name: Components.AddWallet,
            params: { type, walletEcosystem: WalletEcosystem.Substrate },
          }
        : {
            name: Components.ChangePassword,
            params: { name: Components.AddWallet, type, walletEcosystem: WalletEcosystem.Substrate },
          }
    );
  } catch {
    if (active) openError.value = true;
  } finally {
    if (active) isOpening.value = null;
  }
};

const createWallet = () => openAddWallet('create');
const importWallet = () => openAddWallet('import');

const getExportTarget = (vault: UniversalWalletLegacyVaultDescriptor) =>
  resolveUniversalWalletLegacyExportTarget(vault, accountsStore.accounts);

const canExportVault = (vault: UniversalWalletLegacyVaultDescriptor) => !!getExportTarget(vault);

const exportLegacyVault = (vault: UniversalWalletLegacyVaultDescriptor) => {
  if (!active || isLoading.value || loadError.value || isOpening.value) return;
  const target = getExportTarget(vault);

  if (!target) {
    exportFailureVaultId.value = vault.vaultId;

    return;
  }

  exportFailureVaultId.value = null;
  accountsStore.setSelectedWallet(target.account);
  router.push({ name: Components.Export, params: { network: target.network } });
};
</script>

<style lang="scss" scoped>
.universal-migration {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  height: auto;
  min-height: 100%;
  max-width: 640px;
  margin: 0 auto;
  gap: 24px;

  &__title {
    color: $default-white;
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 16px;
    text-align: left;
  }

  &__text {
    color: $grayish-white;
    line-height: 1.5;
    text-align: left;
  }

  &__legacy {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 20px;
  }

  &__vault {
    background-color: $secondary-background-color;
    border: $default-border;
    border-radius: $default-border-radius;
    padding: 12px;
  }

  &__vault-name {
    overflow-wrap: anywhere;
    color: $default-white;
    font-weight: 700;
    margin-bottom: 6px;
  }

  &__vault-address {
    overflow-wrap: anywhere;
    color: $grayish-white;
    font-size: 13px;
  }

  &__vault-export {
    margin-top: 10px;
  }

  &__vault-error {
    color: palette($pink-color, var(--fw-danger));
    font-size: 12px;
    margin-top: 8px;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
