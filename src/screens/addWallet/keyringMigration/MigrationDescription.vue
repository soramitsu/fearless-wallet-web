<template>
  <AboveForm :fullScreen="true" header="migration.upgradeKeyStorage" :showCloseIcon="false">
    <div class="migration">
      <div>
        <div class="upgrading-secure">{{ t('migration.actionRequired') }}</div>

        <div class="text">{{ t('migration.upgradingSecure') }}</div>

        <div class="step">
          <div class="circle">1</div>

          <div class="text">{{ t('migration.createMasterPass') }}</div>
        </div>

        <div class="step">
          <div class="circle">2</div>

          <div class="text">{{ t('migration.enterPass') }}</div>
        </div>
      </div>

      <div class="controls">
        <FButton text="common.start" size="big" width="100%" data-testid="migrationStart" @click="start" />

        <!-- With a master password the wallet already opens, so the remaining passwords can wait. -->
        <FButton
          v-if="alreadyHasMasterPassword"
          text="migration.later"
          type="secondary"
          size="big"
          width="100%"
          :disabled="isDeferring"
          data-testid="migrationLater"
          @click="later"
        />
      </div>
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { useRouter } from 'vue-router';
import { ref, onMounted } from 'vue';
import { useI18n } from '@/locales/useI18n';
import { Components } from '@/router/routes';
import { deferLegacyPasswordMigration, hasMasterPassword } from '@/extension/messaging';
import { useNotify } from '@/plugins/soramitsuUI';

const router = useRouter();
const notify = useNotify();
const { t } = useI18n();

const alreadyHasMasterPassword = ref(false);
const isDeferring = ref(false);

onMounted(async () => (alreadyHasMasterPassword.value = await hasMasterPassword()));

const start = () => {
  const name = alreadyHasMasterPassword.value ? Components.MigrationAccounts : Components.ChangePassword;

  router.push({ name });
};

// "Later" only postpones the prompt: every account stays in the wallet and is listed in Account access.
const later = async () => {
  if (isDeferring.value) return;

  isDeferring.value = true;

  const deferred = await deferLegacyPasswordMigration().catch(() => false);

  isDeferring.value = false;

  if (deferred) router.push({ name: Components.Wallet });
  else notify({ title: t('migration.skipFailed'), message: '', type: 'error' });
};
</script>

<style lang="scss" scoped>
.migration {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;

  .upgrading-secure {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 20px;
    text-align: left;
  }

  .circle {
    width: 40px;
    height: 40px;
    min-width: 40px;
    color: $pink-color;
    background-color: $secondary-background-color;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    margin-right: 15px;
  }

  .step {
    display: flex;
    justify-content: space-between;
    margin-top: 20px;
  }

  .text {
    color: $default-white;
    text-align: left;
  }

  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
