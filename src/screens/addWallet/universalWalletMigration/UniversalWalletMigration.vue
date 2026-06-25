<template>
  <AboveForm :fullScreen="true" header="migration.universalWalletRequired" :showCloseIcon="false">
    <div class="universal-migration">
      <div>
        <div class="universal-migration__title">{{ t('migration.universalWalletActionRequired') }}</div>
        <div class="universal-migration__text">
          {{ t(snapshot.legacyVaults.length ? 'migration.universalWalletLegacyText' : 'migration.universalWalletEmptyText') }}
        </div>

        <div v-if="snapshot.legacyVaults.length" class="universal-migration__legacy">
          <div
            v-for="vault in snapshot.legacyVaults"
            :key="vault.vaultId"
            class="universal-migration__vault"
          >
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
              :disabled="!canExportVault(vault)"
              @click="exportLegacyVault(vault)"
            />
            <div
              v-if="exportFailureVaultId === vault.vaultId"
              class="universal-migration__vault-error"
            >
              {{ t('migration.exportLegacyVaultUnavailable') }}
            </div>
          </div>
        </div>
      </div>

      <div class="universal-migration__controls">
        <FButton text="migration.createUniversalWallet" size="big" @click="createWallet" />
        <FButton
          text="migration.importUniversalWallet"
          type="secondary"
          size="big"
          :border="false"
          @click="importWallet"
        />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AboveForm from '@/components/AboveForm.vue';
import { Components } from '@/router/routes';
import { getUniversalWalletMigrationSnapshot, hasAccounts, hasMasterPassword } from '@/extension/messaging';
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

const snapshot = ref<UniversalWalletMigrationSnapshot>({
  schemaVersion: UNIVERSAL_WALLET_MIGRATION_SCHEMA_VERSION,
  platform: 'web',
  hasUniversalWallet: false,
  legacyVaults: [],
  cutoffAtMillis: WEB_UNIVERSAL_WALLET_CUTOFF_AT_MILLIS,
  evaluatedAtMillis: Date.now(),
});

onMounted(async () => {
  snapshot.value = await getUniversalWalletMigrationSnapshot();
});

const openAddWallet = async (type: 'create' | 'import') => {
  const route = {
    name: Components.AddWallet,
    params: {
      type,
      walletEcosystem: WalletEcosystem.Substrate,
    },
  };

  if (!(await hasMasterPassword()) && (await hasAccounts())) {
    router.push({
      name: Components.ChangePassword,
      params: {
        name: Components.AddWallet,
        type,
        walletEcosystem: WalletEcosystem.Substrate,
      },
    });

    return;
  }

  router.push(route);
};

const createWallet = () => openAddWallet('create');
const importWallet = () => openAddWallet('import');

const getExportTarget = (vault: UniversalWalletLegacyVaultDescriptor) =>
  resolveUniversalWalletLegacyExportTarget(vault, accountsStore.accounts);

const canExportVault = (vault: UniversalWalletLegacyVaultDescriptor) => !!getExportTarget(vault);

const exportLegacyVault = (vault: UniversalWalletLegacyVaultDescriptor) => {
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
  justify-content: space-between;
  height: 100%;
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
    color: $default-white;
    font-weight: 700;
    margin-bottom: 6px;
  }

  &__vault-address {
    color: $grayish-white;
    font-size: 13px;
  }

  &__vault-export {
    margin-top: 10px;
  }

  &__vault-error {
    color: $pink-color;
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
